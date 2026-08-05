export type GoogleFeedSyncCoordinate = {
  namespace: string;
  key: string;
  type: string;
};

export type GoogleFeedSyncCoordinates = {
  google_product_category: GoogleFeedSyncCoordinate | null;
  gender: GoogleFeedSyncCoordinate | null;
  age_group: GoogleFeedSyncCoordinate | null;
};

export function googleFeedQueryVariables(
  coordinates: GoogleFeedSyncCoordinates,
) {
  return {
    categoryNamespace:
      coordinates.google_product_category?.namespace ?? "google_feed_missing",
    categoryKey:
      coordinates.google_product_category?.key ?? "missing_category",
    genderNamespace:
      coordinates.gender?.namespace ?? "google_feed_missing",
    genderKey: coordinates.gender?.key ?? "missing_gender",
    ageGroupNamespace:
      coordinates.age_group?.namespace ?? "google_feed_missing",
    ageGroupKey: coordinates.age_group?.key ?? "missing_age_group",
  };
}

export function productQueryVariables(
  id: string,
  coordinates: GoogleFeedSyncCoordinates,
) {
  return {
    id,
    ...googleFeedQueryVariables(coordinates),
  };
}
