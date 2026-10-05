export default function handler(req, res) {
  const confirmed = process.env.CONFIRMED_EXHIBITION?.trim();
  const exhibitions = [
    { label: "Select exhibition / source", value: "" },
  ];
  if (confirmed) {
    exhibitions.push({ label: confirmed, value: confirmed });
  }
  exhibitions.push({ label: "Other / Source", value: "Other / Source" });
  res.status(200).json({ exhibitions });
}
