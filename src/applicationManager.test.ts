import {
  ApplicationAndServicePrincipalId,
  createApplication,
  deleteApplication,
  findExistingApplication,
  readApplication,
  setLogo,
  setOnPremisesPublishing,
  updateApplicationConfig,
  addOptionalClaims,
  addIdentifierRedirectUris,
  addAppRoles,
  addAppRoleGroupAssignmentsToApp,
  AppRoles,
  setResourceAccess,
} from "./applicationManager";
import { DefaultAzureCredential } from "@azure/identity";

import { expect, describe, test, beforeAll, afterEach } from "vitest";
import { defaultOnPremisesFlags } from "./configuration";
import {
  assignUserRoleToGroups,
  readServicePrincipal,
  setUserAssignmentRequired,
  isAppRoleAssignedToGroup,
  getEntraGroupId,
  getAppRoleId,
} from "./servicePrincipalManager";
import * as process from "process";

async function authenticate() {
  const credential = new DefaultAzureCredential();

  const { token } = await credential.getToken(
    "https://graph.microsoft.com/.default",
  );

  return token;
}

async function cleanup({
  token,
  appDetails,
}: {
  token: string;
  appDetails: ApplicationAndServicePrincipalId;
}) {
  if (appDetails) {
    await deleteApplication({
      token,
      applicationId: appDetails.applicationId,
    });
  }
}

function randomString() {
  return Math.random().toString(36).slice(2, 7);
}

function applicationName() {
  return "azure-app-proxy-manager-" + randomString();
}

function getExternalUrl() {
  const suffix =
    process.env.EXTERNAL_URL_SUFFIX ||
    "app-proxy-poc.sandbox.platform.hmcts.net";
  return `https://${randomString()}.${suffix}`;
}

function getInternalUrl() {
  const suffix =
    process.env.INTERNAL_URL_SUFFIX ||
    "app-proxy-poc.sandbox.platform.hmcts.net";
  return `https://${randomString()}.${suffix}`;
}

describe("applicationManager", () => {
  const logoUrl =
    "https://raw.githubusercontent.com/hmcts/azure-app-proxy/e875c42/logos/incident-bot.png";
  let token: string;

  let appDetails: ApplicationAndServicePrincipalId;
  let appRoles: AppRoles = [
    {
      description: "Some description",
      displayName: "Some name",
      value: "some_value",
      id: "aa9aaaaa-2aa8-49aa-954a-a3aaaa08aaa3",
      groups: ["test_group_A"],
    },
  ];

  const groupNameForRoleAssignments =
    process.env.ROLE_ASSIGNMENT_GROUP || "Test app";

  beforeAll(async () => {
    token = await authenticate();
  });

  afterEach(async () => {
    await cleanup({ token, appDetails });

    appDetails = undefined;
  });

  test("happy path", async () => {
    const displayName = applicationName();

    const existingApplicationId = await findExistingApplication({
      token,
      displayName,
    });
    expect(existingApplicationId).toBeUndefined();

    appDetails = await createApplication({ token, displayName });

    expect(appDetails.applicationId).toBeDefined();
    expect(appDetails.servicePrincipalObjectId).toBeDefined();

    const externalUrl = getExternalUrl();

    await updateApplicationConfig({
      token,
      externalUrl,
      redirectUrls: [externalUrl],
      identifierUrls: [externalUrl],
      appId: appDetails.applicationId,
      hideApp: true,
    });

    await setLogo({ token, appId: appDetails.applicationId, logoUrl });

    const internalUrl = getInternalUrl();
    await setOnPremisesPublishing({
      token,
      appId: appDetails.applicationId,
      onPremisesPublishing: {
        externalUrl: externalUrl,
        internalUrl,
        ...defaultOnPremisesFlags(),
        externalAuthenticationType: "aadPreAuthentication",
      },
    });

    await setUserAssignmentRequired({
      token,
      objectId: appDetails.servicePrincipalObjectId,
      assignmentRequired: false,
    });

    await assignUserRoleToGroups({
      token,
      objectId: appDetails.servicePrincipalObjectId,
      groups: [groupNameForRoleAssignments],
    });

    await addOptionalClaims({
      token,
      applicationId: appDetails.applicationId,
      groupMembershipClaims: "SecurityGroup",
      optionalClaims: [{ name: "groups", additionalProperties: [] }],
    });

    await addIdentifierRedirectUris({
      token,
      appId: appDetails.applicationId,
      identifierUrls: [externalUrl],
      redirectUrls: [externalUrl],
    });

    const groupId = await getEntraGroupId(appRoles[0].groups[0], token);

    await addAppRoles({
      token,
      applicationId: appDetails.applicationId,
      appRoles: appRoles,
    });

    await addAppRoleGroupAssignmentsToApp({
      token: token,
      applicationId: appDetails.servicePrincipalObjectId,
      appRoles: appRoles,
    });

    // Needs to be re-read after updating
    let application = await readApplication({
      token,
      applicationId: appDetails.applicationId,
    });

    let testAppRoleId = await getAppRoleId({
      token,
      objectId: appDetails.servicePrincipalObjectId,
      displayName: application.appRoles[0].displayName,
    }); // Find app role id

    expect(application.appRoles[0].displayName).toEqual("Some name");
    expect(
      await isAppRoleAssignedToGroup({
        token,
        groupId: groupId,
        objectId: appDetails.servicePrincipalObjectId,
        appRoleId: testAppRoleId,
      }),
    ).toBeTruthy();
    expect(application.groupMembershipClaims).toEqual("SecurityGroup");
    expect(application.optionalClaims.saml2Token[0].name).toEqual("groups");

    const identifierUri = application.identifierUris[0];
    expect(identifierUri).toEqual(externalUrl);

    const servicePrincipal = await readServicePrincipal({
      token,
      servicePrincipalObjectId: appDetails.servicePrincipalObjectId,
    });
    expect(servicePrincipal.appRoleAssignmentRequired).toEqual(false);
    expect(servicePrincipal.info.logoUrl).toBeDefined();
  });

  test("finds existing application when creating", async () => {
    const displayName = applicationName();

    appDetails = await createApplication({ token, displayName });
    const appDetails2 = await createApplication({ token, displayName });

    expect(appDetails.applicationId).toEqual(appDetails2.applicationId);
    expect(appDetails.servicePrincipalObjectId).toEqual(
      appDetails2.servicePrincipalObjectId,
    );
  });

  test("setLogo does nothing if no logo", async () => {
    const displayName = applicationName();
    appDetails = await createApplication({ token, displayName });

    await setLogo({
      token,
      appId: appDetails.applicationId,
      logoUrl: undefined,
    });

    const servicePrincipal = await readServicePrincipal({
      token,
      servicePrincipalObjectId: appDetails.servicePrincipalObjectId,
    });
    expect(servicePrincipal.info.logoUrl).toBeNull();
  });

  test("setResourceAccess - one appRole and one oauth2 permission scope", async () => {
    const displayName = applicationName();
    appDetails = await createApplication({ token, displayName });

    await setResourceAccess({
      token: token,
      applicationId: appDetails.applicationId,
      graphApiPermissions: ["Group.Create", "offline_access"],
    });
    // sleep for 10 seconds to allow the changes to propagate
    await new Promise((r) => setTimeout(r, 10000));

    let application = await readApplication({
      token,
      applicationId: appDetails.applicationId,
    });
    let requiredResourceAccessList = application.requiredResourceAccess;
    expect(requiredResourceAccessList).toBeDefined();
    console.log("requiredResourceAccess -", requiredResourceAccessList);
    expect(requiredResourceAccessList.length).toEqual(1);
    let resourceAccessDetails = requiredResourceAccessList[0];
    expect(resourceAccessDetails).toBeDefined();
    expect(resourceAccessDetails.resourceAccess.length).toEqual(2);
    expect(resourceAccessDetails.resourceAppId).toEqual(
      "00000003-0000-0000-c000-000000000000",
    );
    expect(resourceAccessDetails.resourceAccess[0].id).toEqual(
      "bf7b1a76-6e77-406b-b258-bf5c7720e98f",
    );
    expect(resourceAccessDetails.resourceAccess[0].type).toEqual("Role");
    expect(resourceAccessDetails.resourceAccess[1].id).toEqual(
      "7427e0e9-2fba-42fe-b0c0-848c9e6a8182",
    );
    expect(resourceAccessDetails.resourceAccess[1].type).toEqual("Scope");
  });
});
