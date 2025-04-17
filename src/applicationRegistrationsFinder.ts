// Azure authentication library to access Azure Key Vault
import { DefaultAzureCredential } from "@azure/identity";

import { findApplicationsByName } from "./helper/applicationRegistrations.js";

// Azure SDK clients accept the credential as a parameter
const credential = new DefaultAzureCredential();

const { token } = await credential.getToken(
  "https://graph.microsoft.com/.default",
);
let errors = false;

// an array of application names (i.e prefixes) to search for
const applicationNames = ["hmi"];
// iterate over the array of application names and call the findAppRegistrationsByName function for each name
for await (const applicationName of applicationNames) {
  const applications = await findApplicationsByName(applicationName, token);
  console.log(`found ${applicationName} appRegs `, applications.length);
  applications.forEach((app: { id: string; displayName: string; publisherDomain: string; createdDateTime: string; }) => {
    console.log(`${app.id}, ${app.displayName}, ${app.publisherDomain}, ${app.createdDateTime}`);
  });
}
