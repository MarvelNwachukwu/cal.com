import type { GetStaticPropsContext } from "next";

import getAppKeysFromSlug from "../../../_utils/getAppKeysFromSlug";

export const getStaticProps = async (ctx: GetStaticPropsContext) => {
  if (typeof ctx.params?.slug !== "string") return { notFound: true } as const;
  let publicKey = "";
  let secretKey = "";
  const appKeys = await getAppKeysFromSlug("paystack");
  if (typeof appKeys.public_key === "string" && typeof appKeys.secret_key === "string") {
    publicKey = appKeys.public_key;
    secretKey = appKeys.secret_key;
  }

  return {
    props: {
      publicKey,
      secretKey,
    },
  };
};
