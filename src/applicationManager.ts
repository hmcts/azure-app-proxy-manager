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

  await errorHandler("Retrieving application", result);

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
  identifierUrls,
  hideApp,
}: {
  token: string;
  appId: string;
  externalUrl: string;
  redirectUrls: Array<string>;
  identifierUrls: Array<string>;
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
        identifierUris: identifierUrls,
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

export async function addIdentifierRedirectUris({
  token,
  appId,
  redirectUrls,
  identifierUrls,
}: {
  token: string;
  appId: string;
  redirectUrls: Array<string>;
  identifierUrls: Array<string>;
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
        identifierUris: identifierUrls,
        web: {
          redirectUris: redirectUrls,
        },
      }),
    },
  );
  await errorHandler("Adding Saml config", result);
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

/*
 * This function will set the Graph API roles (i.e. permissions) and oAuth2 permission scopes for a given application.
 * In the light of the Graph API resources this function mainly deal with the
 * {@link https://learn.microsoft.com/en-us/graph/api/resources/requiredresourceaccess?view=graph-rest-1.0 | requiredResourceAccess } property of the application resource.
 * @param token the access token
 * @param applicationId the application object Id
 * @param graphApiPermissions the list of permissions and permission scopes to be set for the application
 * @returns: void
 */
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
    // Ms Graph API resource object Id
    const graphAppId: string = "00000003-0000-0000-c000-000000000000";
    console.log("Granting Graph API permissions");

    // Get all Graph Application appRoles
    const {
      appRoleIds,
      graphAPIObjectId,
    }: { appRoleIds: string[]; graphAPIObjectId: any } = await getGraphAppRoles(
      token,
      graphApiPermissions,
    );

    // Get all Graph app oAuth2 permission scopes
    const { scopeIds }: { scopeIds: string[] } =
      await getGraphAppOAuth2PermissionScopes(token, graphApiPermissions);
    console.log("GraphAppOAuth2PermissionScopes: ", scopeIds.length);
    const application = await readApplication({ token, applicationId });

    let currRequiredResourceAccess = application.requiredResourceAccess ?? [];

    let newRequiredResourceAccess = await _buildRequiredResourceAccessPayload(
      currRequiredResourceAccess,
      graphAppId,
      appRoleIds,
      scopeIds,
    );

    const body = {
      requiredResourceAccess: newRequiredResourceAccess,
    };
    console.log("requiredResourceAccess", JSON.stringify(body));
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
  } else {
    console.log("No graph api permissions to grant");
  }
}

function _buildResourceAccess(roleIds: string[], accessType: string) {
  // example: [{"id":"14dad69e-099b-42c9-810b-d002981feec1","type":"Scope"},
  //           {"id":"e1fe6dd8-ba31-4d61-89e7-88639da4683d","type":"Role"}
  //          ]
  return roleIds.map((id) => ({ id, type: accessType }));
}

async function _buildRequiredResourceAccessPayload(
  currRequiredResourceAccessList: any[],
  graphAppId: string,
  appRoleIds: string[],
  scopeIds: string[],
) {
  /* todo: to remove current resource access and then build a new one based on access roles and access scopes. However we need to deal with
           the eventual consistency of the graph API. */
  let roleAccess = _buildResourceAccess(appRoleIds, "Role") ?? [];
  let scopeAccess = _buildResourceAccess(scopeIds, "Scope") ?? [];
  console.log(
    "currRequiredResourceAccessObj",
    JSON.stringify(currRequiredResourceAccessList),
  );
  const requiredResourceAccessForGraphAPI = {
    resourceAppId: graphAppId,
    resourceAccess: roleAccess.concat(scopeAccess),
  };

  // find the matching resource app id (i.e. Microsoft Graph) and replace the resource access
  let resourceAccessFound = false;
  for (let i = 0; i < currRequiredResourceAccessList.length; i++) {
    if (currRequiredResourceAccessList[i].resourceAppId === graphAppId) {
      currRequiredResourceAccessList[i].resourceAccess =
        requiredResourceAccessForGraphAPI.resourceAccess;
      resourceAccessFound = true;
      break; // Assuming you want to replace only the first match
    }
  }

  if (!resourceAccessFound) {
    currRequiredResourceAccessList.push(requiredResourceAccessForGraphAPI);
  }
  return currRequiredResourceAccessList;
}

async function getGraphAppOAuth2PermissionScopes(
  token: string,
  graphApiPermissions: string[],
) {
  console.log("Getting MS Graph oAuth2 permission scopes");
  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=displayName eq 'Microsoft Graph'&$select=id,oauth2PermissionScopes`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  await errorHandler(
    "Getting MS Graph oAuth2 permission scopes",
    graphResponse,
  );

  const graphAppObj = (await graphResponse.json()).value[0];
  const permissionScopes = graphAppObj.oauth2PermissionScopes;

  const scopeIds: string[] = [];

  for (const permission of graphApiPermissions) {
    const matchingPermission = permissionScopes.find(
      (scope: { value: string }) =>
        scope.value.toLowerCase() === permission.toLowerCase(),
    );
    if (matchingPermission) {
      scopeIds.push(matchingPermission.id);
    } else {
      console.log(
        `[WARN] "${permission}" couldn't be found in MS Graph oAuth2 permission scopes`,
      );
    }
  }

  if (scopeIds.length === 0) {
    console.log(
      "[INFO] Required Graph API permissions are not of oAuth2 permission scope",
      graphApiPermissions,
    );
  }

  return { scopeIds: scopeIds };
}
async function getGraphAppRoles(token: string, graphApiPermissions: string[]) {
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
 * Necessary where an app role is deleted, they must all be disabled first. Easier to disable by default and enable when updating.
 */
async function disableAppRoles(
  applicationId: string,
  token: string,
  appRoles: Array<AppRole>,
) {
  const app = await readApplication({ token, applicationId });
  let appRolesJson: Array<AppRole> = app.appRoles;
  // App Role combinations defined locally
  const requiredAppRoles = appRoles.map(
    ({ displayName, id }) => `name:${displayName}_id:${id}`,
  );
  // App Role combinations already existing on application
  const existingAppRoles = appRolesJson.map(
    ({ displayName, id }) => `name:${displayName}_id:${id}`,
  );
  // Finds matching pairs of app roles in Azure compared to locally
  const commonPairs = existingAppRoles.filter((pair) =>
    requiredAppRoles.includes(pair),
  );

  // Only disable roles if there are more roles in Azure than there is defined locally
  if (commonPairs.length < existingAppRoles.length) {
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
  } else {
    return;
  }
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
  let nextLink: string | null =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/appRoleAssignments`;
  let assignmentExists = false;

  while (nextLink) {
    const response: Response = await fetch(nextLink, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const assignments = await response.json();
    assignmentExists = assignments.value.some(
      (assignment: {
        appRoleId: string;
        resourceId: string;
        resourceDisplayName: string;
      }) =>
        assignment.appRoleId === appRoleId &&
        assignment.resourceId === applicationId,
    );

    if (assignmentExists) {
      return true;
    }
    // Check if there are more pages
    nextLink = assignments["@odata.nextLink"];
  }
  return false;
}

/**
 * Assigns groups to App Roles for a given application
 * @param groupId Azure entra group ID to assign an app role to
 * @param appRoleId ID of the app role to assign the group to
 * @param applicationId ID of the application to assign the group to app roles for
 */
async function createApplicationGroupAssignments({
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
      await createApplicationGroupAssignments({
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
  // To keep existing functionality working of assigning AD groups general access
  appRolesCollection.push({
    allowedMemberTypes: ["User"],
    description: "User",
    displayName: "User",
    id: "18d14569-c3bd-439b-9a66-3a2aee01d14f",
    isEnabled: true,
    value: "",
  });

  for (const role of appRoles) {
    // Destructure to remove groups from this function as they aren't needed here
    const { groups, ...remaining } = role;
    let appRole: AppRole = {
      allowedMemberTypes: ["User"],
      isEnabled: true,
      ...remaining,
    };
    appRolesCollection.push(appRole);
  }
  // In case of deletion of an app role
  await disableAppRoles(applicationId, token, appRolesCollection);

  await updateApplicationAppRoles({
    token,
    applicationId,
    appRoles: appRolesCollection,
  });
  console.log(
    "Updated App Roles of application, moving on to group assignments",
  );
}
