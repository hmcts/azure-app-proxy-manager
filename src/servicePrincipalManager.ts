import { errorHandler } from "./errorHandler.js";
import { getDateByAddingDays } from "./utils.js";

export async function setUserAssignmentRequired({
  token,
  objectId,
  assignmentRequired,
}: {
  token: string;
  objectId: string;
  assignmentRequired: boolean;
}) {
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals/${objectId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appRoleAssignmentRequired: assignmentRequired,
      }),
    },
  );

  await errorHandler("updating servicePrincipal config", result);
}

export async function readServicePrincipal({
  token,
  servicePrincipalObjectId,
}: {
  token: string;
  servicePrincipalObjectId: string;
}) {
  console.log("Retrieving service principal", servicePrincipalObjectId);
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  await errorHandler("reading service principal", result);

  return await result.json();
}

export async function findExistingServicePrincipal({
  token,
  displayName,
}: {
  token: string;
  displayName: string;
}): Promise<string | undefined> {
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=displayName eq '${displayName}'&$top=1&$select=id`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  await errorHandler("searching for service principal", result);

  const body = await result.json();

  if (body.value.length === 1) {
    return body.value[0].id;
  }
  return undefined;
}

export async function getAppRoleId({
  token,
  objectId,
  displayName,
}: {
  token: string;
  objectId: string;
  displayName: string;
}) {
  const url = `https://graph.microsoft.com/beta/servicePrincipals/${objectId}/appRoles`;

  const result = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await errorHandler("finding app role Id", result);

  const body = await result.json();
  var appRole = body.find(
    (element: any) => element.displayName === displayName,
  );

  return appRole.id;
}

export async function getEntraGroupId(groupName: string, token: string) {
  const url = `https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${groupName}' and securityEnabled eq true&$select=id`;

  const result = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await errorHandler("finding group id", result);

  const body = await result.json();
  return body.value[0].id;
}

export async function isAppRoleAssignedToGroup({
  groupId,
  objectId,
  token,
  appRoleId,
}: {
  groupId: string;
  objectId: string;
  token: string;
  appRoleId: string;
}) {
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/groups/${groupId}/appRoleAssignments?$filter=resourceId eq ${objectId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  await errorHandler("Checking if app role is already assigned", result);

  const body = await result.json();
  var appRole = body.value.find((element: any) => element.id === appRoleId);

  if (appRole) {
    return true;
  } else {
    return false;
  }
}

async function assignRoleToGroup({
  group,
  token,
  objectId,
  appRoleId,
}: {
  group: string;
  token: string;
  objectId: string;
  appRoleId: string;
}) {
  const groupId = await getEntraGroupId(group, token);

  const appRoleAssignedAlready = await isAppRoleAssignedToGroup({
    groupId,
    objectId,
    token,
    appRoleId,
  });

  if (appRoleAssignedAlready) {
    console.log("Group already assigned", group);
  } else {
    const appRoleAssignmentsResult = await fetch(
      `https://graph.microsoft.com/beta/servicePrincipals/${objectId}/appRoleAssignments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          principalId: groupId,
          principalType: "Group",
          appRoleId,
          resourceId: objectId,
        }),
      },
    );

    await errorHandler(
      "assigning app role assignment",
      appRoleAssignmentsResult,
    );

    console.log("Assigned group", group);
  }
}

export async function assignUserRoleToGroups({
  token,
  objectId,
  groups,
}: {
  groups: string[];
  objectId: string;
  token: string;
}) {
  if (groups.length > 0) {
    const appRoleId = await getAppRoleId({
      token,
      objectId,
      displayName: "User",
    }); // Find User app role id

    for await (const group of groups) {
      await assignRoleToGroup({ group, token, objectId, appRoleId });
    }
  }
}

export async function enableSaml({
  displayName,
  token,
  objectId,
  appId,
}: {
  displayName: string;
  objectId: string;
  token: string;
  appId: string;
}) {
  const result = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals/${objectId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preferredSingleSignOnMode: "saml",
      }),
    },
  );
  await errorHandler("Enabling Saml config", result);

  await addTokenSigningCertificate({ displayName, token, objectId, appId });
}

async function addTokenSigningCertificate({
  displayName,
  token,
  objectId,
  appId,
}: {
  displayName: string;
  objectId: string;
  token: string;
  appId: string;
}) {
  const servicePrincipal = await readServicePrincipal({
    token,
    servicePrincipalObjectId: objectId,
  });

  //Adds a new signing certificate if all certificates are expiring.
  if (
    servicePrincipal.keyCredentials === undefined ||
    servicePrincipal.keyCredentials.length == 0 ||
    areAllCertficatesExpiring(servicePrincipal.keyCredentials)
  ) {
    const addCertificateResult = await createNewSigningCert(
      objectId,
      token,
      displayName,
    );

    const certificateThumbprint = (await addCertificateResult.json())
      .thumbprint;
    await makeCertDefault(objectId, token, certificateThumbprint);
  }
}

function areAllCertficatesExpiring(keyCredentialsArray: any[]) {
  for (const credential of keyCredentialsArray) {
    if (new Date(credential.endDateTime) > new Date(getDateByAddingDays(10))) {
      return false;
    }
  }
  return true;
}

async function makeCertDefault(
  objectId: string,
  token: string,
  thumbprint: any,
) {
  console.log("Making new signing cert active");

  const preferredCertResult = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals/${objectId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preferredTokenSigningKeyThumbprint: `${thumbprint}`,
      }),
    },
  );

  await errorHandler("Adding Saml signing certificate", preferredCertResult);
}

async function createNewSigningCert(
  objectId: string,
  token: string,
  displayName: string,
) {
  console.log("creating new signing cert");
  const addCertificateResult = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals/${objectId}/addTokenSigningCertificate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: `CN=${displayName}`,
        endDateTime: getDateByAddingDays(365),
      }),
    },
  );

  await errorHandler("Adding Saml signing certificate", addCertificateResult);
  return addCertificateResult;
}
