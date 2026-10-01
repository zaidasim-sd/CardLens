export default function handler(req, res) {
  res.status(200).json({
    exhibitions: [
    { label: "Select exhibition / source", value: "" },
    ...["Event A", "Event B", "Event C", "Event D"].map(value => ({ label: value, value })),
  ],
  });
}
