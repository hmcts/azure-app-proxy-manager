// Azure authentication library to access Azure Key Vault
import { DefaultAzureCredential } from "@azure/identity";
import { Application } from "./application.js";
import {
  createApplication,
  setLogo,
  setOnPremisesPublishing,
  setTLSCertificate,
  updateApplicationConfig,
  addOptionalClaims,
  addSsoSamlUris,
  addClientSecret,
  setResourceAccess,
  addAppRoles,
  addAppRoleGroupAssignmentsToApp,
} from "./applicationManager.js";
import { loadApps } from "./configuration.js";
import {
  assignGroups,
  setUserAssignmentRequired,
  enableSaml,
} from "./servicePrincipalManager.js";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import * as process from "process";

const argv = await yargs(hideBin(process.argv))
  .option("config", {
    alias: "c",
    type: "string",
    description: "Path to the configuration file",
  })
  .strict()
  .usage("Usage: $0 -c [path]")
  .demandOption(["config"]).argv;

const apps: Application[] = await loadApps(argv.config);

console.log("Processing", apps);

// Azure SDK clients accept the credential as a parameter
const credential = new DefaultAzureCredential();

const { token } = await credential.getToken(
  "https://graph.microsoft.com/.default",
);
let errors = false;

/**
 * Guides used to create this:
 * - https://learn.microsoft.com/en-us/graph/application-proxy-configure-api?tabs=http
 * - https://learn.microsoft.com/en-us/azure/active-directory/manage-apps/assign-user-or-group-access-portal?pivots=ms-graph
 */
for await (const app of apps) {
  try {
    const { applicationId, servicePrincipalObjectId } = await createApplication(
      {
        token,
        displayName: app.name,
      },
    );

    await updateApplicationConfig({
      token,
      externalUrl: app.onPremisesPublishing.externalUrl,
      redirectUrls: app.redirectUrls,
      identifierUrls: app.identifierUrls,
      appId: applicationId,
      hideApp: app.hideApp,
    });

    await setLogo({ token, appId: applicationId, logoUrl: app.logoUrl });
    await setOnPremisesPublishing({
      token,
      appId: applicationId,
      onPremisesPublishing: app.onPremisesPublishing,
    });

    await setUserAssignmentRequired({
      token,
      objectId: servicePrincipalObjectId,
      assignmentRequired: app.appRoleAssignmentRequired,
    });
    await assignGroups({
      token,
      objectId: servicePrincipalObjectId,
      groups: app.appRoleAssignments,
    });

    await setTLSCertificate({ token, appId: applicationId, tls: app.tls });

    if (
      app.preferredSingleSignOnMode &&
      app.preferredSingleSignOnMode == "saml"
    ) {
      await enableSaml({
        displayName: app.name,
        token,
        objectId: servicePrincipalObjectId,
        appId: applicationId,
      });
    }

    await addOptionalClaims({
      token: token,
      applicationId: applicationId,
      groupMembershipClaims: app.groupMembershipClaims,
      optionalClaims: app.optionalClaims,
    });

    await setResourceAccess({
      token: token,
      applicationId: applicationId,
      graphApiPermissions: app.graphApiPermissions,
    });

    await addClientSecret({
      token: token,
      applicationId: applicationId,
      clientSecret: app.clientSecret,
    });

    if (app.appRoles) {
      await addAppRoles({
        token: token,
        applicationId: applicationId,
        appRoles: app.appRoles,
      });

      // Pass the object ID of the enterprise app
      await addAppRoleGroupAssignmentsToApp({
        token: token,
        applicationId: servicePrincipalObjectId,
        appRoles: app.appRoles,
      });
    }

    if (
      app.preferredSingleSignOnMode &&
      app.preferredSingleSignOnMode == "saml"
    ) {
      await addSsoSamlUris({
        token: token,
        appId: applicationId,
        identifierUrls: app.identifierUrls,
        redirectUrls: app.redirectUrls,
      });
    }

    console.log("Created application successfully", app.name, applicationId);
  } catch (err) {
    console.log(err);
    errors = true;
  }
}

if (errors) {
  process.exit(1);
}
