import {
  buildCybersourceHttpSignatureHeaders,
  cybersourceHost,
} from "@/server/payments/cybersourceSignature";
import {
  getResolvedCybersourceConfig,
  type ResolvedCybersourceConfig,
} from "@/server/cybersource/client";

type Billing = {
  firstName: string;
  lastName: string;
  address1: string;
  locality: string;
  administrativeArea: string;
  postalCode: string;
  country: string;
  email: string;
  phoneNumber?: string;
};

export type BrowserData = {
  accept: string;
  language: string;
  colorDepth: string;
  javaEnabled: "Y" | "N";
  javascriptEnabled: "Y";
  screenHeight: string;
  screenWidth: string;
  timeDifference: string;
  userAgent: string;
  ipAddress: string;
};

export type PayerAuthenticationData = {
  indicator?: string;
  eciRaw?: string;
  cavv?: string;
  xid?: string;
  directoryServerTransactionId?: string;
  threeDSServerTransactionId?: string;
  specificationVersion?: string;
  paresStatus?: string;
};

export type PayerAuthenticationChallenge = {
  authenticationTransactionId: string;
  stepUpUrl: string;
  token: string;
  cardType?: string;
};

type Call = { httpStatus: number | null; body: any; networkError: string | null };

async function postSigned(cfg: ResolvedCybersourceConfig, path: string, body: unknown): Promise<Call> {
  const host = cybersourceHost(cfg.env);
  const json = JSON.stringify(body);
  const headers = buildCybersourceHttpSignatureHeaders({
    method: "POST", path, body: json, merchantId: cfg.merchantId,
    keyId: cfg.keyId, sharedSecret: cfg.sharedSecret, host,
  });
  try {
    const response = await fetch(`https://${host}${path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/hal+json" },
      body: json,
    });
    const text = await response.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { rawText: text.slice(0, 1000) }; }
    return { httpStatus: response.status, body: parsed, networkError: null };
  } catch (error: any) {
    return { httpStatus: null, body: null, networkError: error?.message ?? "network error" };
  }
}

function toAuthenticationData(info: any): PayerAuthenticationData {
  return {
    indicator: info?.indicator,
    eciRaw: info?.eciRaw ?? info?.eci,
    cavv: info?.cavv,
    xid: info?.xid,
    directoryServerTransactionId: info?.directoryServerTransactionId,
    threeDSServerTransactionId: info?.threeDSServerTransactionId,
    specificationVersion: info?.specificationVersion,
    paresStatus: info?.paresStatus,
  };
}

/** Start the CyberSource browser 3-D Secure device-profiling session. */
export async function setupPayerAuthentication(transientToken: string) {
  const cfg = await getResolvedCybersourceConfig();
  const result = await postSigned(cfg, "/risk/v1/authentication-setups", {
    tokenInformation: { transientToken },
  });
  const info = result.body?.consumerAuthenticationInformation;
  if (!result.httpStatus || result.httpStatus >= 300 || !info?.referenceId || !info?.accessToken || !info?.deviceDataCollectionUrl) {
    throw new Error(result.body?.errorInformation?.message ?? result.networkError ?? "Unable to initialize cardholder verification.");
  }
  return { referenceId: info.referenceId as string, accessToken: info.accessToken as string, deviceDataCollectionUrl: info.deviceDataCollectionUrl as string };
}

/** Check enrollment after browser device collection. The caller may then either
 * authorize a frictionless result or render the returned step-up iframe. */
export async function checkPayerAuthentication(input: {
  transientToken: string;
  referenceId: string;
  amount: string;
  currency: string;
  billing: Billing;
  browser: BrowserData;
  returnUrl: string;
  customerId: string;
  expirationMonth: string;
  expirationYear: string;
}) {
  const cfg = await getResolvedCybersourceConfig();
  const result = await postSigned(cfg, "/risk/v1/authentications", {
    orderInformation: { amountDetails: { totalAmount: input.amount, currency: input.currency }, billTo: input.billing },
    paymentInformation: {
      customer: { customerId: input.customerId },
      card: { expirationMonth: input.expirationMonth, expirationYear: input.expirationYear },
    },
    deviceInformation: {
      ipAddress: input.browser.ipAddress,
      httpAcceptContent: input.browser.accept,
      httpBrowserLanguage: input.browser.language,
      httpBrowserJavaEnabled: input.browser.javaEnabled,
      httpBrowserJavaScriptEnabled: input.browser.javascriptEnabled,
      httpBrowserColorDepth: input.browser.colorDepth,
      httpBrowserScreenHeight: input.browser.screenHeight,
      httpBrowserScreenWidth: input.browser.screenWidth,
      httpBrowserTimeDifference: input.browser.timeDifference,
      userAgentBrowserValue: input.browser.userAgent,
    },
    consumerAuthenticationInformation: {
      deviceChannel: "BROWSER", transactionMode: "eCommerce",
      referenceId: input.referenceId, returnUrl: input.returnUrl, acsWindowSize: "05",
    },
    tokenInformation: { transientToken: input.transientToken },
  });
  const info = result.body?.consumerAuthenticationInformation;
  if (result.body?.status === "PENDING_AUTHENTICATION" && info?.authenticationTransactionId && info?.stepUpUrl && info?.token) {
    return { kind: "challenge" as const, challenge: { authenticationTransactionId: info.authenticationTransactionId, stepUpUrl: info.stepUpUrl, token: info.token, cardType: result.body?.paymentInformation?.card?.type } };
  }
  if (result.body?.status === "AUTHENTICATION_SUCCESSFUL") return { kind: "authenticated" as const, authentication: toAuthenticationData(info) };
  throw new Error(result.body?.errorInformation?.message ?? result.networkError ?? "Cardholder verification was not completed.");
}

/** Complete a required 3-D Secure challenge, then return fields safe to send
 * straight into the following authorization request. */
export async function validatePayerAuthentication(input: { authenticationTransactionId: string; cardType?: string }) {
  const cfg = await getResolvedCybersourceConfig();
  const result = await postSigned(cfg, "/risk/v1/authentication-results", {
    paymentInformation: input.cardType ? { card: { type: input.cardType } } : undefined,
    consumerAuthenticationInformation: { authenticationTransactionId: input.authenticationTransactionId },
  });
  if (result.body?.status !== "AUTHENTICATION_SUCCESSFUL") {
    throw new Error(result.body?.errorInformation?.message ?? result.networkError ?? "Cardholder verification was not completed.");
  }
  return toAuthenticationData(result.body?.consumerAuthenticationInformation);
}
