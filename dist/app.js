var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const AWS = require("aws-sdk");
AWS.config.update({
    region: process.env.REGION ? process.env.REGION : "us-east-1",
});
function getKeyName(folder, filename) {
    return folder + "/" + filename;
}
var StorageOptions;
(function (StorageOptions) {
    StorageOptions[StorageOptions["s3"] = 0] = "s3";
    StorageOptions[StorageOptions["drive"] = 1] = "drive";
    StorageOptions[StorageOptions["dropbox"] = 2] = "dropbox";
})(StorageOptions || (StorageOptions = {}));
var NotificationeOptions;
(function (NotificationeOptions) {
    NotificationeOptions[NotificationeOptions["sns"] = 0] = "sns";
    NotificationeOptions[NotificationeOptions["relic"] = 1] = "relic";
    NotificationeOptions[NotificationeOptions["pagerDuty"] = 2] = "pagerDuty";
})(NotificationeOptions || (NotificationeOptions = {}));
class WebhookProcessor {
    constructor(request) {
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
            throw new Error("Please provide a signing key");
        }
        if (!process.env.NOTIFICATION_SERVICE) {
            throw new Error("Please specify notification service");
        }
        if (!process.env.STORAGE_SERVICE) {
            throw new Error("Please specify storage service");
        }
    }
    processWebHook() {
        return __awaiter(this, void 0, void 0, function* () {
            let body;
            let statusCode = "200";
            const headers = {
                "Content-Type": "application/json",
            };
            this.validateEnvironmentVariables();
            if (this.isVerifiedSender(process.env.SIGNING_KEY, this.signature.timestamp, this.signature.token, this.signature.signature)) {
                try {
                    switch (this.request.httpMethod) {
                        case "POST":
                            body = yield this.sendNotification(process.env.NOTIFICATION_SERVICE);
                            body += yield this.storeEventLog(process.env.STORAGE_SERVICE);
                            break;
                        default:
                            throw new Error(`Unsupported method "${this.request.httpMethod}"`);
                    }
                }
                catch (err) {
                    statusCode = "400";
                    body = err.message;
                }
                finally {
                    body = JSON.stringify(body);
                }
            }
            else {
                statusCode = "400";
                body = "Unauthorised request";
            }
            return {
                statusCode,
                body,
                headers,
            };
        });
    }
    isVerifiedSender(signingKey, timestamp, token, signature) {
        const crypto = require("crypto");
        const encodedToken = crypto
            .createHmac("sha256", signingKey)
            .update(timestamp.concat(token))
            .digest("hex");
        return encodedToken === signature;
    }
    processSNS() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!process.env.SNS_ARN) {
                throw new Error("Please specify SNS ARN");
            }
            let sns = new AWS.SNS({ apiVersion: "2010-03-31" });
            let snsParams = {
                Message: JSON.stringify(this.eventContent, null, 2),
                Subject: "Mailgun Webhook notification",
                TopicArn: process.env.SNS_ARN,
            };
            // Create promise and SNS service object
            var snsResult = yield sns.publish(snsParams).promise();
            console.log(snsResult);
            if (snsResult.MessageId) {
                console.log(`Message ${snsParams.Message} sent to the topic ${snsParams.TopicArn}`);
            }
            else {
                console.log("Failed to send notification");
            }
        });
    }
    processS3() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!process.env.S3_BUCKET_NAME) {
                throw new Error("Please specify S3 bucket name");
            }
            let s3 = new AWS.S3({ apiVersion: "2006-03-01" });
            var bucketName = "receeve-mailgun";
            let keyName = `${this.event.id}.txt`;
            var objectParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: keyName,
                Body: JSON.stringify(this.eventContent, null, 2),
            };
            // Create object upload promise
            var uploadResult = yield s3.putObject(objectParams).promise();
            console.log(uploadResult);
            if (uploadResult.ETag) {
                console.log("Successfully uploaded data to " + bucketName + "/" + keyName);
            }
            else {
                console.log("Upload failed");
            }
        });
    }
    sendNotification(service) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (service) {
                case "sns":
                    yield this.processSNS();
                    break;
                default:
                    throw new Error(`Please provide a service`);
            }
            return "Notification sent successfully.";
        });
    }
    storeEventLog(service) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (service) {
                case "s3":
                    yield this.processS3();
                    break;
                default:
                    throw new Error(`Please provide a service`);
            }
            return "Event stored successfully.";
        });
    }
}
const handler = (event, context) => __awaiter(this, void 0, void 0, function* () {
    console.log("Received event:", JSON.stringify(event, null, 2));
    const mailgun = new WebhookProcessor(event);
    const processResponse = yield mailgun.processWebHook();
    console.log(processResponse);
    return processResponse;
});
exports.handler = handler;
const eventData = {
    "resource": "/",
    "path": "/",
    "httpMethod": "POST",
    "headers": null,
    "multiValueHeaders": null,
    "queryStringParameters": null,
    "multiValueQueryStringParameters": null,
    "pathParameters": null,
    "stageVariables": null,
    "requestContext": {
        "resourceId": "tz879dexv5",
        "resourcePath": "/",
        "httpMethod": "POST",
        "extendedRequestId": "Apsg-GFJIAMF1Og=",
        "requestTime": "09/Jun/2021:09:46:46 +0000",
        "path": "/",
        "accountId": "1234567890",
        "protocol": "HTTP/1.1",
        "stage": "test-invoke-stage",
        "domainPrefix": "testPrefix",
        "requestTimeEpoch": 1623232006020,
        "requestId": "2507c2d5-552a-421e-bc61-e4d740311e9b",
        "identity": {
            "cognitoIdentityPoolId": null,
            "cognitoIdentityId": null,
            "apiKey": "test-invoke-api-key",
            "principalOrgId": null,
            "cognitoAuthenticationType": null,
            "userArn": "arn:aws:iam::1234567890:root",
            "apiKeyId": "test-invoke-api-key-id",
            "userAgent": "aws-internal/3 aws-sdk-java/1.11.1014 Linux/5.4.102-52.177.amzn2int.x86_64 OpenJDK_64-Bit_Server_VM/25.292-b10 java/1.8.0_292 vendor/Oracle_Corporation cfg/retry-mode/legacy",
            "accountId": "1234567890",
            "caller": "1234567890",
            "sourceIp": "test-invoke-source-ip",
            "accessKey": "ABCDEFGHIJKLMNOPQRST",
            "cognitoAuthenticationProvider": null,
            "user": "1234567890"
        },
        "domainName": "testPrefix.testDomainName",
        "apiId": "in3trz7mpg"
    },
    "body": "{\n  \"signature\":\n  {\n    \"timestamp\": \"1529006854\",\n    \"token\": \"a8ce0edb2dd8301dee6c2405235584e45aa91d1e9f979f3de0\",\n    \"signature\": \"50dd7709613e688fd1e2c445b680b1948fe09ea315d472df2c6c8db88154902b\"\n  },\n  \"event-data\":\n  {\n    \"event\": \"opened\",\n    \"timestamp\": 1529006854.329574,\n    \"id\": \"DACSsAdVSeGpLid7TN03WA\"\n  }\n}",
    "isBase64Encoded": false
};
handler(eventData, {});
//# sourceMappingURL=app.js.map