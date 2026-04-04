import type { GetStaticPropsContext } from "next";

import getAppKeysFromSlug from "../../../_utils/getAppKeysFromSlug";

export const getStaticProps = async (ctx: GetStaticPropsContext) => {
  if (typeof ctx.params?.slug !== "string") return { notFound: true } as const;
  const appKeys = await getAppKeysFromSlug("paystack");
  const hasKeys =
    typeof appKeys.public_key === "string" &&
    appKeys.public_key.length > 0 &&
    typeof appKeys.secret_key === "string" &&
    appKeys.secret_key.length > 0;

  return {
    props: {
      hasKeys,
    },
  };
};
