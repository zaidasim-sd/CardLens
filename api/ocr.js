// Public prototype does not accept arbitrary images.
export default function handler(_req, res) {
  return res.status(403).json({ error: 'PUBLIC_PROTOTYPE_FICTIONAL_DEMO_ONLY' });
}
