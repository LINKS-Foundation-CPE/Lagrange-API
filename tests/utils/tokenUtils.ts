export const validHeader = {
  alg: "RS256",
  typ: "JWT",
  kid: "O7h9qKN8dlv-NfZ7Bmt4BMd-2iAg1kyI1DkhtGs99Nk",
};

export const invalidHeader = {
  alg: "RS256",
  typ: "JWT",
  kid: "O7h9qKN8dlv-asd-2iAg1kyI1DkhtGs99Nk",
};

export const randomSignature = "Random Signature";

const base64UrlEncode = (input: string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export const generateToken = (
  header = validHeader,
  payload = {},
  signature = randomSignature,
) => {
  const base64Header = base64UrlEncode(JSON.stringify(header));
  const base64Payload = base64UrlEncode(JSON.stringify(payload));
  const base64Signature = base64UrlEncode(signature);
  return `${base64Header}.${base64Payload}.${base64Signature}`;
};

export const generateInvalidKidToken = () => {
  return generateToken(invalidHeader, {});
};

export const generateExpiredToken = () => {
  return generateToken(validHeader, { exp: 1755760017 });
};

export const generateValidAdminToken = () => {
  const now = new Date();
  const exp = now.getTime();
  return generateToken(validHeader, {
    exp,
    email: "admin@test",
    sub: "admin-sub",
    realm_access: {
      roles: ["platform-admin"],
    },
  });
};
