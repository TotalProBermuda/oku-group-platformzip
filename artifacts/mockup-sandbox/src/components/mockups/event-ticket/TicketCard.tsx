import "./ticket.css";

function QRSimulation() {
  const size = 21;
  const seed = [
    [1,1,1,1,1,1,1,0,1,0,1,1,0,0,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,1,0,0,1,0,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,0,0,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,1,1,0,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,0,1,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0],
    [1,1,0,1,1,0,1,0,1,0,1,1,0,1,1,0,1,0,1,1,0],
    [0,1,1,0,0,1,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0],
    [1,0,1,0,1,1,1,1,0,1,0,0,1,1,0,1,0,1,0,0,1],
    [0,1,0,0,1,0,0,1,1,0,1,0,0,1,0,0,1,0,0,1,1],
    [1,1,1,0,0,1,1,0,0,0,1,0,1,1,1,0,0,0,1,0,1],
    [0,0,0,0,0,0,0,0,1,0,1,1,0,1,0,1,1,0,1,0,0],
    [1,1,1,1,1,1,1,0,0,1,0,0,1,0,1,0,0,1,0,0,1],
    [1,0,0,0,0,0,1,0,1,0,1,0,0,1,0,0,1,0,1,1,0],
    [1,0,1,1,1,0,1,1,0,1,1,1,0,0,1,1,0,0,0,1,1],
    [1,0,1,1,1,0,1,0,1,0,0,0,1,0,0,0,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,0,0,1,1,0,1,1,0,0,1,0,0,1],
    [1,0,0,0,0,0,1,0,1,1,0,0,1,0,0,1,0,0,1,0,0],
    [1,1,1,1,1,1,1,0,1,0,1,0,0,0,1,1,1,0,0,1,0],
  ];
  const cell = 100 / size;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="white"/>
      {seed.map((row, r) =>
        row.map((bit, c) =>
          bit ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill="#1a1614"
            />
          ) : null
        )
      )}
    </svg>
  );
}

export function TicketCard() {
  return (
    <div className="ticket-shell">
      <div className="ticket-label">Guest View · My Tickets</div>
      <div className="ticket-phone">
        <div className="status-bar">
          <span>9:41</span>
          <span>●●●</span>
        </div>

        <div className="phone-header">
          <span className="back-arrow">←</span>
          <span className="phone-title">My Tickets</span>
          <span style={{width:24}}/>
        </div>

        <div className="phone-scroll">
          <div className="section-label">UPCOMING (1)</div>

          <div className="ticket-card">
            <div className="ticket-top">
              <div className="ticket-top-left">
                <div className="venue-tier">OKU · VIP TABLE</div>
                <div className="event-name">Silver Night at Terrace</div>
              </div>
              <div className="badge-confirmed">CONFIRMED</div>
            </div>

            <div className="ticket-body">
              <div className="qr-wrapper">
                <QRSimulation />
              </div>
              <div className="ticket-info">
                <div className="ticket-type-name">VIP Table — Window</div>
                <div className="ticket-meta">
                  <span>📅</span>
                  <span>Sat, May 10 · 9:00 PM</span>
                </div>
                <div className="ticket-meta">
                  <span>📍</span>
                  <span>Panama City</span>
                </div>
                <div className="ticket-code">TK-A1B2C3D4E5F</div>
              </div>
            </div>

            <div className="tear-line" />

            <div className="ticket-footer">
              <span className="for-label">For: Carlos Mendez</span>
              <a className="view-link">View Event →</a>
            </div>
          </div>

          <div className="section-label" style={{marginTop: 24}}>PAST (1)</div>

          <div className="ticket-card past-card">
            <div className="ticket-top past-top">
              <div className="ticket-top-left">
                <div className="venue-tier" style={{color:"rgba(255,255,255,0.5)"}}>CATCH · GA</div>
                <div className="event-name">Summer Opening</div>
              </div>
              <div className="badge-attended">ATTENDED</div>
            </div>

            <div className="ticket-body">
              <div className="qr-wrapper" style={{opacity:0.3}}>
                <QRSimulation />
              </div>
              <div className="ticket-info">
                <div className="ticket-type-name" style={{color:"#9ca3af"}}>General Admission</div>
                <div className="ticket-meta" style={{color:"#9ca3af"}}>
                  <span>📅</span>
                  <span>Fri, Mar 21 · 10:00 PM</span>
                </div>
                <div className="ticket-meta" style={{color:"#9ca3af"}}>
                  <span>📍</span>
                  <span>Panama City</span>
                </div>
                <div className="ticket-code" style={{color:"#d1d5db"}}>TK-X9Y8Z7W6V5</div>
              </div>
            </div>

            <div className="tear-line" />
            <div className="ticket-footer">
              <span className="for-label">For: Carlos Mendez</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
