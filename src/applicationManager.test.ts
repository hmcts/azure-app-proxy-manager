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
} from "./applicationManager";
import { DefaultAzureCredential } from "@azure/identity";

import { expect, describe, test, beforeAll, afterEach } from "vitest";
import { defaultOnPremisesFlags } from "./configuration";
import {
  assignGroups,
  readServicePrincipal,
  setUserAssignmentRequired,
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
      },
    });

    await setUserAssignmentRequired({
      token,
      objectId: appDetails.servicePrincipalObjectId,
      assignmentRequired: false,
    });
    await assignGroups({
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

    const application = await readApplication({
      token,
      applicationId: appDetails.applicationId,
    });

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
});
