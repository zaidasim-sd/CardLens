import { getExhibitionOptions } from "../../shared/exhibitions.mjs";

export default function handler(req, res) {
  res.status(200).json({ exhibitions: getExhibitionOptions() });
}
