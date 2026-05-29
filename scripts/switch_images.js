import "dotenv/config";

const SHOP = env("SHOPIFY_SHOP_DOMAIN");
const API_VERSION = env("SHOPIFY_API_VERSION") || "2024-04";

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante: ${name}`);
  return value;
}

async function getAccessToken() {
  const clientId = env("SHOPIFY_CLIENT_ID");
  const clientSecret = env("SHOPIFY_CLIENT_SECRET");

  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.access_token) {
    console.error(json);
    throw new Error("Impossible de récupérer l'access token Shopify");
  }

  return json.access_token;
}

async function shopifyGraphQL(query, variables = {}) {
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  const json = await res.json();

  if (!res.ok || json.errors) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error("Erreur GraphQL Shopify");
  }

  return json.data;
}

const GET_PRODUCTS = `
query GetCosmiqueProducts($cursor: String) {
  products(first: 100, after: $cursor, query: "title:*Marguerites*") {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      title
      media(first: 250) {
        nodes {
          id
          mediaContentType
        }
      }
    }
  }
}
`;

const REORDER_MEDIA = `
mutation SwapFirstAndLastMedia($productId: ID!, $moves: [MoveInput!]!) {
  productReorderMedia(id: $productId, moves: $moves) {
    job {
      id
    }
    mediaUserErrors {
      field
      message
    }
  }
}
`;

async function main() {
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphQL(GET_PRODUCTS, { cursor });

    for (const product of data.products.nodes) {
      const images = product.media.nodes.filter(
        (media) => media.mediaContentType === "IMAGE",
      );

      if (images.length < 2) {
        console.log(`Ignoré : ${product.title} — moins de 2 images`);
        continue;
      }

      const firstImage = images[0];
      const lastImage = images[images.length - 1];
      const lastPosition = images.length - 1;

      const variables = {
        productId: product.id,
        moves: [
          {
            id: firstImage.id,
            newPosition: lastPosition.toString(),
          },
          {
            id: lastImage.id,
            newPosition: "0",
          },
        ],
      };

      const result = await shopifyGraphQL(REORDER_MEDIA, variables);

      const errors = result.productReorderMedia.mediaUserErrors;
      if (errors.length) {
        console.error(`Erreur sur ${product.title}:`, errors);
      } else {
        console.log(`OK : ${product.title}`);
      }
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
}

main().catch(console.error);
