import { OnPremisesPublishing } from "./onPremisesPublishing.js";
import { errorHandler } from "./errorHandler.js";
import {
  findExistingServicePrincipal,
  getEntraGroupId,
} from "./servicePrincipalManager.js";
import { TLS } from "./tls.js";

import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

import forge from "node-forge";
import { setPasswordOnPfx } from "./pfx.js";
import { ClientSecret } from "./clientSecret.js";
import { getDateByAddingDays } from "./utils.js";

export type ApplicationAndServicePrincipalId = {
  applicationId: string;
  servicePrincipalObjectId: string;
};
export type AppRoleAndGroupAssignments = {
  displayName: string;
  description: string;
  value: string;
  id: string;
  groups: string[];
};
export type AppRole = {
  allowedMemberTypes: string[];
  description: string;
  displayName: string;
  id: string;
  isEnabled: Boolean;
  value: string;
};
export type AppRoles = Array<AppRoleAndGroupAssignments>;
export async function createApplication({
  token,
  displayName,
}: {
  token: string;
  displayName: string;
}): Promise<ApplicationAndServicePrincipalId> {
  const applicationId = await findExistingApplication({ token, displayName });
  if (applicationId) {
    console.log("Found existing application", displayName, applicationId);

    const servicePrincipalObjectId = await findExistingServicePrincipal({
      token,
      displayName,
    });

    if (!servicePrincipalObjectId) {
      throw new Error(
        `Found application ${displayName} but no service principal, aborting`,
      );
    }

    return { applicationId, servicePrincipalObjectId };
  }

  console.log("Creating application", displayName);
  const result = await fetch(
    "https://graph.microsoft.com/v1.0/applicationTemplates/8adf8e6e-67b2-4cf2-a259-e3dc5476c621/instantiate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
      }),
    },
  );

  const body = await result.json();
  await errorHandler("creating application", result);

  await waitTillApplicationExists({ token, appId: body.application.id });

  return {
    applicationId: body.application.id,
    servicePrincipalObjectId: body.servicePrincipal.id,
  };
}

export function helloWorld() {
  console.log("me");
}

export async function readApplication({
  token,
  applicationId,
}: {
  token: string;
  applicationId: string;
}) {
  console.log("Retrieving application", applicationId);
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/applications/${applicationId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  await errorHandler("reading application", result);

  return await result.json();
}

export async function deleteApplication({
  token,
  applicationId,
}: {
  token: string;
  applicationId: string;
}) {
  console.log("Deleting application", applicationId);
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/applications/${applicationId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  await errorHandler("deleting application", result);
}

export async function findExistingApplication({
  token,
  displayName,
}: {
  token: string;
  displayName: string;
}): Promise<string | undefined> {
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/applications?$filter=displayName eq '${displayName}'&$top=1&$select=id`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  await errorHandler("searching for application", result);

  const body = await result.json();

  if (body.value.length === 1) {
    return body.value[0].id;
  }
  return undefined;
}

async function waitTillApplicationExists({
  appId,
  token,
}: {
  appId: string;
  token: string;
}) {
  async function handler() {
    const result = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${appId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!result.ok && result.status !== 404) {
      console.log("Unexpected error reading application", result.status);
      console.log(result.statusText);
      console.log(await result.json());
    }

    return result.ok;
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const result = await handler();
    if (result) {
      return;
    }

    console.log("Waiting for application to be created, attempt", attempt);
    // Could do exponential backoff by combining with attempt
    const sleepSeconds = 2;
    await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));

    const maxAttempts = 30;
    if (attempt > maxAttempts) {
      throw new Error(
        `Failed to find application after ${maxAttempts} attempts`,
      );
    }
  }
}

export async function updateApplicationConfig({
  token,
  appId,
  externalUrl,
  redirectUrls,
  hideApp,
}: {
  token: string;
  appId: string;
  externalUrl: string;
  redirectUrls: Array<string>;
  hideApp: boolean;
}): Promise<void> {
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/applications/${appId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifierUris: [externalUrl],
        web: {
          redirectUris: redirectUrls,
          homePageUrl: externalUrl,
        },
        tags: hideApp ? ["HideApp"] : [],
      }),
    },
  );

  await errorHandler("updating application config", result);
}

export async function setLogo({
  token,
  appId,
  logoUrl,
}: {
  appId: string;
  logoUrl: string;
  token: string;
}) {
  if (logoUrl) {
    const logo = await fetch(logoUrl);

    const contentType = logo.headers.get("content-type");
    const data = await logo.blob();

    const result = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${appId}/logo`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType || "image/png",
        },
        body: data,
      },
    );

    await errorHandler("setting logo", result);
  }
}

export async function setOnPremisesPublishing({
  token,
  appId,
  onPremisesPublishing,
}: {
  appId: string;
  onPremisesPublishing: OnPremisesPublishing;
  token: string;
}): Promise<void> {
  const result = await fetch(
    `https://graph.microsoft.com/beta/applications/${appId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        onPremisesPublishing,
      }),
    },
  );

  await errorHandler("setting onPremisesPublishing", result);
}

async function retrievePfxFromAzureKeyVault(tls: TLS) {
  const credential = new DefaultAzureCredential();
  const keyVaultName = tls.key_vault_name;
  const url = "https://" + keyVaultName + ".vault.azure.net";
  const secretClient = new SecretClient(url, credential);
  const secret = await secretClient.getSecret(tls.name);

  const pfx = secret.value;
  if (!pfx) {
    throw new Error("No certificate found");
  }
  return pfx;
}

export async function setTLSCertificate({
  appId,
  tls,
  token,
}: {
  appId: string;
  tls: TLS;
  token: string;
}) {
  if (tls) {
    const pfx = await retrievePfxFromAzureKeyVault(tls);

    // the password doesn't matter as we just need anything set on it to be able to upload the pfx to Azure AD
    const pfxPassword = "password";
    const pfxBase64 = setPasswordOnPfx(pfx, pfxPassword);

    const body = {
      onPremisesPublishing: {
        verifiedCustomDomainKeyCredential: {
          type: "X509CertAndPassword",
          value: pfxBase64,
        },
        verifiedCustomDomainPasswordCredential: {
          value: pfxPassword,
        },
      },
    };

    const result = await fetch(
      `https://graph.microsoft.com/beta/applications/${appId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    await errorHandler("setting tls certificate", result);
  }
}

export async function addOptionalClaims({
  token,
  applicationId,
  groupMembershipClaims,
  optionalClaims,
}: {
  token: string;
  applicationId: string;
  groupMembershipClaims: String;
  optionalClaims: [{ name: string; additionalProperties: Array<String> }];
}): Promise<void> {
  if (optionalClaims || groupMembershipClaims) {
    const body = {
      groupMembershipClaims: groupMembershipClaims,
      optionalClaims:
        optionalClaims && optionalClaims.length > 0
          ? {
              saml2Token: optionalClaims,
            }
          : {},
    };
    const result = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${applicationId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    await errorHandler("Add optional claims", result);
  }
}

export async function addClientSecret({
  token,
  applicationId,
  clientSecret,
}: {
  token: string;
  applicationId: string;
  clientSecret: ClientSecret;
}): Promise<void> {
  if (clientSecret && clientSecret.key_vault_name) {
    const application = await readApplication({ token, applicationId });

    if (
      application.passwordCredentials &&
      application.passwordCredentials.length > 0 &&
      areAllPasswordsExpired(clientSecret.name, application.passwordCredentials)
    ) {
      const body = {
        passwordCredential: {
          displayName: `${clientSecret.name}`,
        },
      };
      const addPasswordResult = await fetch(
        `https://graph.microsoft.com/v1.0/applications/${applicationId}/addPassword`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      await errorHandler("Add client password", addPasswordResult);

      const clientPassword = (await addPasswordResult.json()).secretText;

      const credential = new DefaultAzureCredential();
      const keyVaultName = clientSecret.key_vault_name;
      const url = "https://" + keyVaultName + ".vault.azure.net";
      const secretClient = new SecretClient(url, credential);
      await secretClient.setSecret(clientSecret.name, clientPassword);
    }
  }
}

function areAllPasswordsExpired(name: string, passwordCredentials: Array<any>) {
  for (const credential of passwordCredentials) {
    if (
      credential.displayName == name &&
      new Date(credential.endDateTime) > new Date(getDateByAddingDays(10))
    ) {
      return false;
    }
  }
  return true;
}

export async function setResourceAccess({
  token,
  applicationId,
  graphApiPermissions,
}: {
  token: string;
  applicationId: string;
  graphApiPermissions: Array<string>;
}) {
  if (graphApiPermissions && graphApiPermissions.length > 0) {
    const graphAppId = "00000003-0000-0000-c000-000000000000";
    console.log("Granting graphapi permissions");

    const {
      appRoleIds,
      graphAPIObjectId,
    }: { appRoleIds: string[]; graphAPIObjectId: any } = await getGraphAPIRoles(
      token,
      graphApiPermissions,
    );

    const application = await readApplication({ token, applicationId });

    let requiredResourceAccess = application.requiredResourceAccess ?? [];

    const graphPerms = {
      resourceAppId: graphAppId,
      resourceAccess: appRoleIds.map((id) => ({ id, type: "Role" })),
    };

    let graphPermsFound = false;

    for (let i = 0; i < requiredResourceAccess.length; i++) {
      if (requiredResourceAccess[i].resourceAppId === graphAppId) {
        requiredResourceAccess[i].resourceAccess = graphPerms.resourceAccess;
        graphPermsFound = true;
        break; // Assuming you want to replace only the first match
      }
    }

    if (!graphPermsFound) {
      requiredResourceAccess.push(graphPerms);
    }

    const body = {
      requiredResourceAccess: requiredResourceAccess,
    };

    const assignRolesResult = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${applicationId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    await errorHandler("Granting graph api permissions", assignRolesResult);
  }
}
async function getGraphAPIRoles(token: string, graphApiPermissions: string[]) {
  const graphAPIIDResult = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=displayName eq 'Microsoft Graph'&$select=id,appRoles`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  await errorHandler("Getting Graph API Object ID", graphAPIIDResult);

  const graphAPIObject = (await graphAPIIDResult.json()).value[0];
  const graphAPIObjectId = graphAPIObject.id;
  const graphAPIAppRoles = graphAPIObject.appRoles;

  const appRoleIds: string[] = [];

  for (const permission of graphApiPermissions) {
    const matchingAppRole = graphAPIAppRoles.find(
      (appRole: { value: string }) => appRole.value === permission,
    );
    if (matchingAppRole) {
      appRoleIds.push(matchingAppRole.id);
    } else {
      console.log(`"${permission}" couldn't be found in Graph API roles`);
    }
  }
  return { appRoleIds, graphAPIObjectId };
}

/**
 * Updates an Azure Entra Application, with a collection of App Roles
 * @param applicationId The object ID of application registration
 * @param appRoles appRoles to update the application with
 */
export async function updateApplicationAppRoles({
  token,
  applicationId,
  appRoles,
}: {
  token: string;
  applicationId: string;
  appRoles: AppRole[];
}): Promise<void> {
  let body = {
    appRoles: appRoles,
  };
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/applications/${applicationId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  await errorHandler("updating application config", result);
}

/**
 * Create formatted AppRole object which is expected by graph api
 * @param id Must be unique compared to other App Roles on this application
 * @param value Must be unique compared to other App Roles on this application
 * @return AppRole Returns a promise of structured AppRole type object
 */
function generateStructuredAppRole(
  displayName: string,
  description: string,
  id: string,
  value: string,
): AppRole {
  return {
    allowedMemberTypes: ["User"],
    description: description,
    displayName: displayName,
    id: id,
    isEnabled: true,
    value: value,
  };
}

/**
 * Necessary where an app role is deleted, they must all be disabled first. Easier to disable by default and enable when updating.
 */
async function disableAppRoles(applicationId: string, token: string) {
  const app = await readApplication({ token, applicationId });
  let appRolesJson: Array<AppRole> = app.appRoles;
  // Keep fetched array of AppRoles but change enabled to false
  const disabledAppRolesJson = appRolesJson.map(
    (role) =>
      ({
        ...role,
        isEnabled: false,
      }) as AppRole,
  );
  await updateApplicationAppRoles({
    token,
    applicationId,
    appRoles: disabledAppRolesJson,
  });
  console.log("Temporarily disabled app roles to allow updates");
}

/**
 * Checks at least one of the group app role assignment mappings exists for a given entra group ID and app role ID, for a given application
 */
async function checkIfGroupAppRoleAssignmentExists({
  token,
  groupId,
  appRoleId,
  applicationId,
}: {
  token: string;
  groupId: string;
  appRoleId: string;
  applicationId: string;
}): Promise<boolean> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${groupId}/appRoleAssignments`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  const assignments = await response.json();
  const assignmentExists = assignments.value.some(
    (assignment: { appRoleId: string; resourceId: string }) =>
      assignment.appRoleId === appRoleId &&
      assignment.resourceId === applicationId,
  );
  return assignmentExists;
}

/**
 * Assigns groups to App Roles for a given application
 * @param groupId Azure entra group ID to assign an app role to
 * @param appRoleId ID of the app role to assign the group to
 * @param applicationId ID of the application to assign the group to app roles for
 */
async function updateApplicationGroupAssignments({
  token,
  groupId,
  appRoleId,
  applicationId,
}: {
  token: string;
  groupId: string;
  appRoleId: string;
  applicationId: string;
}): Promise<void> {
  const existingAssignment = await checkIfGroupAppRoleAssignmentExists({
    token,
    groupId,
    appRoleId,
    applicationId,
  });

  if (!existingAssignment) {
    let body = {
      principalId: groupId,
      resourceId: applicationId,
      appRoleId: appRoleId,
    };
    const result = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${groupId}/appRoleAssignments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    console.log("Added group role assignment");
    await errorHandler("updating application config", result);
  } else {
    console.log("Group role assignment already exists, skipping");
  }
}

/**
 * Updates an Azure Entra Application group assignments, specifically for app roles
 * @param applicationId The object ID of enterprise application
 * @param appRoles A collection (array) of AppRole custom objects to update the application with
 */
export async function addAppRoleGroupAssignmentsToApp({
  token,
  applicationId,
  appRoles,
}: {
  token: string;
  applicationId: string;
  appRoles: AppRoles;
}) {
  for (const role of appRoles) {
    for (const group of role.groups) {
      let groupId = await getEntraGroupId(group, token);
      await updateApplicationGroupAssignments({
        token: token,
        groupId: groupId,
        appRoleId: role.id,
        applicationId: applicationId,
      });
      console.log(
        "Updated group role assignments for:",
        role.displayName,
        "App Role, processing group:",
        group,
      );
    }
  }
}

/**
 * Updates an Azure Entra Application with a collection of App Roles
 * @param applicationId The object ID of application registration
 * @param appRoles A collection (array) of AppRole custom objects to update the application with
 */
export async function addAppRoles({
  token,
  applicationId,
  appRoles,
}: {
  token: string;
  applicationId: string;
  appRoles: AppRoles;
}) {
  let appRolesCollection: Array<AppRole> = [];
  // Must all be disabled first in case of deletion of an app role
  await disableAppRoles(applicationId, token);
  for (const role of appRoles) {
    let appRole = await generateStructuredAppRole(
      role.displayName,
      role.description,
      role.id,
      role.value,
    );
    appRolesCollection.push(appRole);
  }
  await updateApplicationAppRoles({
    token,
    applicationId,
    appRoles: appRolesCollection,
  });
  console.log(
    "Updated App Roles of application, moving on to group assignments",
  );
}
