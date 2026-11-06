## Initial Setup
In order to start this application you will need
* A functional web server
* NodeJS 
* NPM
After these are installed to your environment, you can put this directory onto your web server

## AWS Setup
This project was built for an AWS Environment, such as an EC2 instance. You may run it locally but it requires certain credentials including:
* An IAM user with full Simple Email Service access
* An Email registered with SES

## Configuration
* KEYS= The Keys of the Sheets File that will be processed, these are the column names 
* LINK = The link to your Google Sheets file that is hosted on Drive, replace the endpoint with /export?format=csv 
* REGION = The AWS Region this is hosted on 
* SENDER = The email it will be sent from, Must be registered on AWS Simple Email Service
* RECEIVER = The email you want to receive notifications on 
* ACCESS = Your AWS IAM User Access Key SECRET = Your AWS IAM Secret Key
## Included Files
Important Files are JsonParser.JS (The Backend) and CalendarApplication.html (The Frontend). You can configure any web server to serve CalendarApplication.html like a normal web page. Calendar.json and Events.json should also be accessible to the web server. All other files should remain protected

## External Dependencies 
This application has two dependencies AWS SES SDK and Node Cron. You can install these to your web server with

`npm install @aws-sdk/client-sesv2  npm install node-cron`

Node Package Manager will install these to your server

## Startup
You can start the backend of the application with
`node JsonParser.js`

Now the application is running in the background. You will receive weekly emails about upcoming forms


