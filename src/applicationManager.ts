import { OnPremisesPublishing } from "./onPremisesPublishing.js";
import { errorHandler } from "./errorHandler.js";
import { findExistingServicePrincipal } from "./servicePrincipalManager.js";
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
        `Found application ${displayName} but no service principal, aborting`
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
    }
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
    }
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
    }
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
    }
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
      }
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
        `Failed to find application after ${maxAttempts} attempts`
      );
    }
  }
}

export async function updateApplicationConfig({
  token,
  appId,
  externalUrl,
  redirectUrls,
}: {
  token: string;
  appId: string;
  externalUrl: string;
  redirectUrls: Array<string>;
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
      }),
    }
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
      }
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
    }
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
      }
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
      }
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
    console.log("creating secret");
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
        }
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
