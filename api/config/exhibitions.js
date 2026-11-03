import {
  getExhibitionOptions,
  getDefaultExhibition,
  ALL_EXHIBITION_NAMES,
} from "../../shared/exhibitions.mjs";

export default function handler(req, res) {
  res.status(200).json({
    exhibitions: getExhibitionOptions(),
    allExhibitions: ALL_EXHIBITION_NAMES,
    defaultExhibition: getDefaultExhibition(),
  });
}
