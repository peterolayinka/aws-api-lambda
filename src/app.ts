const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.REGION ? process.env.REGION : "us-east-1",
});

function getKeyName(folder, filename) {
  return folder + "/" + filename;
}

interface Signature {
  timestamp: string;
  token: string;
  signature: string;
}

interface EventData {
  event: string,
  timestamp: string;
  id: string;
}

interface EventContent {
  Provider: string,
  timestamp: string;
  type: string;
}

enum StorageOptions {
  "s3",
  "drive",
  "dropbox",
}

enum NotificationeOptions {
  "sns",
  "relic",
  "pagerDuty",
}

class WebhookProcessor {
  request: any;
  event: EventData;
  signature: Signature;
  eventContent: EventContent

  constructor(
    request: any,
  ) {
    this.request = request;
    let parsedBody = JSON.parse(this.request.body);

    this.event = parsedBody["event-data"];
    this.signature = parsedBody.signature;
    this.eventContent = {
      Provider: "Mailgun",
      timestamp: this.event.timestamp,
      type: `email ${this.event.event}`,
    };
  }

  validateEnvironmentVariables() {
    if (!process.env.SIGNING_KEY) {
      throw new Error("Please provide a signing key")
    }
    if (!process.env.NOTIFICATION_SERVICE) {
      throw new Error("Please specify notification service")
    }
    if (!process.env.STORAGE_SERVICE) {
      throw new Error("Please specify storage service")
    }
  }

  async processWebHook() {
    let body: string;
    let statusCode = "200";
    const headers = {
      "Content-Type": "application/json",
    };

    this.validateEnvironmentVariables()

    if (
      this.isVerifiedSender(
        process.env.SIGNING_KEY,
        this.signature.timestamp,
        this.signature.token,
        this.signature.signature
      )
    ) {
      try {
        switch (this.request.httpMethod) {
          case "POST":
            body = await this.sendNotification(process.env.NOTIFICATION_SERVICE);
            body += await this.storeEventLog(process.env.STORAGE_SERVICE);

            break;
          default:
            throw new Error(`Unsupported method "${this.request.httpMethod}"`);
        }
      } catch (err) {
        statusCode = "400";
        body = err.message;
      } finally {
        body = JSON.stringify(body);
      }
    } else {
      statusCode = "400";
      body = "Unauthorised request";
    }

    return {
      statusCode,
      body,
      headers,
    };
  }

  isVerifiedSender(
    signingKey: string,
    timestamp: string,
    token: string,
    signature: string
  ) {
    const crypto = require("crypto");
    const encodedToken = crypto
      .createHmac("sha256", signingKey)
      .update(timestamp.concat(token))
      .digest("hex");

    return encodedToken === signature;
  }

  async processSNS() {
    if (!process.env.SNS_ARN) {
      throw new Error("Please specify SNS ARN")
    }

    let sns = new AWS.SNS({ apiVersion: "2010-03-31" });
    let snsParams = {
      Message: JSON.stringify(this.eventContent, null, 2),
      Subject: "Mailgun Webhook notification",
      TopicArn: process.env.SNS_ARN,
    };

    // Create promise and SNS service object
    var snsResult = await sns.publish(snsParams).promise();
    console.log(snsResult)
    if (snsResult.MessageId) {
      console.log(
        `Message ${snsParams.Message} sent to the topic ${snsParams.TopicArn}`
      );

    } else {
      console.log(
        "Failed to send notification"
      );
    }
  }

  async processS3() {
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error("Please specify S3 bucket name")
    }

    let s3 = new AWS.S3({ apiVersion: "2006-03-01" });

    var bucketName = "receeve-mailgun";
    let keyName = `${this.event.id}.txt`

    var objectParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: keyName,
      Body: JSON.stringify(this.eventContent, null, 2),
    };

    // Create object upload promise
    var uploadResult = await s3.putObject(objectParams).promise();
    console.log(uploadResult)
    if (uploadResult.ETag) {
      console.log(
        "Successfully uploaded data to " + bucketName + "/" + keyName
      );

    } else {
      console.log(
        "Upload failed"
      );
    }
  }

  async sendNotification(service: string) {
    switch (service) {
      case "sns":
        await this.processSNS()
        break;
      default:
        throw new Error(`Please provide a service`);
    }
    return "Notification sent successfully.";
  }

  async storeEventLog(service: string) {
    switch (service) {
      case "s3":
        await this.processS3()
        break;
      default:
        throw new Error(`Please provide a service`);
    }
    return "Event stored successfully.";
  }
}

const handler = async (event, context) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  const mailgun = new WebhookProcessor(event);
  const processResponse = await mailgun.processWebHook();
  console.log(processResponse);
  return processResponse
};

exports.handler = handler
