import yaml from "js-yaml";
import { promises as fsPromises } from "fs";
import { Application } from "./application.js";

// TODO merge with config
export function defaultOnPremisesFlags(): {
  externalAuthenticationType: "aadPreAuthentication";
  isHttpOnlyCookieEnabled: boolean;
  isOnPremPublishingEnabled: boolean;
  isPersistentCookieEnabled: boolean;
  isSecureCookieEnabled: boolean;
  isTranslateHostHeaderEnabled: boolean;
  isTranslateLinksInBodyEnabled: boolean;
} {
  return {
    externalAuthenticationType: "aadPreAuthentication",
    isHttpOnlyCookieEnabled: true,
    isOnPremPublishingEnabled: true,
    isPersistentCookieEnabled: true,
    isSecureCookieEnabled: true,
    isTranslateHostHeaderEnabled: true,
    isTranslateLinksInBodyEnabled: false,
  };
}

export async function loadApps(configFilePath: string): Promise<Application[]> {
  const file = await fsPromises.readFile(configFilePath, "utf8");
  const yamlApps: any = yaml.load(file);
  return yamlApps.apps.map((app: any) => {
    const application: Application = {
      name: app.name,
      logoUrl: app.logoUrl,
      tls: app.tls,
      preferredSingleSignOnMode: app.preferredSingleSignOnMode,
      appRoleAssignmentRequired:
        app.userAssignmentRequired === undefined
          ? true
          : app.userAssignmentRequired,
      appRoleAssignments:
        app.appRoleAssignments === undefined ? [] : app.appRoleAssignments,
      redirectUrls:
        app.redirectUrls === undefined ? [app.externalUrl] : app.redirectUrls,
      onPremisesPublishing: {
        externalUrl: app.externalUrl,
        internalUrl: app.internalUrl,
        ...defaultOnPremisesFlags(),
      },
      samlConfig: app.samlConfig,
    };
    return application;
  });
}
