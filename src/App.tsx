import { useState } from 'react';
import { SINGLE_DEMO_CARD } from './config/demoCards';
export default function App() {
  const [show, setShow] = useState(false);
  return <main style={{ maxWidth: 900, margin: '40px auto', padding: 24, color: 'black', background: 'white', fontFamily: 'Aptos, Arial, sans-serif' }}>
    <h1 style={{ fontSize: 28 }}>CardSnap by Vision71</h1>
    <p style={{ border: '1px solid black', padding: 16 }}>Public prototype. Fictional demonstration only. Real cards and Aventure data are not accepted.</p>
    <p>Capture a card, review its details, and obtain reviewer approval before transfer to Constant Contact.</p>
    <img src={SINGLE_DEMO_CARD.imagePath} alt="Fictional demonstration business card" style={{ maxWidth: '100%', width: 500, margin: '24px 0' }} />
    <div><button onClick={() => setShow(!show)} style={{ border: '1px solid black', padding: 12 }}>Show prepared fictional extraction</button></div>
    {show && <div style={{ marginTop: 20 }}><p>This is prepared demonstration data, not a live OCR result.</p><p>Name: {SINGLE_DEMO_CARD.preparedData.fullName}</p><p>Company: {SINGLE_DEMO_CARD.preparedData.companyName}</p><p>Email: {SINGLE_DEMO_CARD.preparedData.email}</p></div>}
    <p style={{ marginTop: 24 }}>The internal pilot runs separately with named accounts, approval controls, and a central review queue.</p>
  </main>;
}
