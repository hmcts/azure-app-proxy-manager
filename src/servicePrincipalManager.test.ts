import { getEntraGroupId } from "./servicePrincipalManager";
import { expect, describe, test, beforeAll, afterEach } from "vitest";
import { authenticate } from "./testUtils";

describe("servicePrincipalManager", () => {
  let token: string;

  beforeAll(async () => {
    token = await authenticate();
  });

  test("getEntraGroupId group exists", async () => {
    const groupId = await getEntraGroupId("test_group_A", token);
    expect(groupId).toEqual("844e7f86-e45e-4d9b-90ef-deaeb15a3e11");
  });

  test("getEntraGroupId group does not exist", async () => {
    expect(
      async () => await getEntraGroupId("does_not_exist", token),
    ).toThrowError(
      "Error finding group id, does the group does_not_exist exist?",
    );
  });
});
