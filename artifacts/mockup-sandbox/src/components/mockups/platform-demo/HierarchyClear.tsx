import React from 'react';
import { ChevronRight } from 'lucide-react';

const groups = [
  {
    title: "Administration",
    personas: [
      { name: "Superadmin", desc: "Full system access — all modules", color: "#1a1614", borderColor: "#3a332f", badge: "SUPERADMIN", initials: "SA" },
      { name: "Admin Commercial", desc: "Series, orders, payouts management", color: "#7c3aed", badge: "ADMIN", initials: "AC" },
      { name: "Admin IR", desc: "Investor relations & documents", color: "#1d4ed8", badge: "ADMIN", initials: "AI" },
      { name: "Admin HR", desc: "Jobs, applications & staff", color: "#059669", badge: "ADMIN", initials: "AH" },
    ]
  },
  {
    title: "Creators & Partners",
    personas: [
      { name: "Influencer", desc: "Dashboard, referrals & commissions", color: "#c41e3a", badge: "CREATOR", initials: "IN" },
      { name: "Partner", desc: "Partner dashboard & co-hosted series", color: "#d97706", badge: "PARTNER", initials: "PR" },
      { name: "Investor", desc: "IR document portal & reports", color: "#0891b2", badge: "INVESTOR", initials: "IV" },
    ]
  },
  {
    title: "Operations",
    personas: [
      { name: "Staff (OKÜ)", desc: "SOPs, training & operations", color: "#64748b", badge: "STAFF", initials: "ST" },
      { name: "Attendee", desc: "Browse series, buy tickets & orders", color: "#c41e3a", badge: "GUEST", initials: "AT" },
    ]
  },
  {
    title: "Referrer Network",
    personas: [
      { name: "Carlos Mendez", desc: "Streetside host — referrals & commissions", color: "#854d0e", badge: "REFERRER", initials: "CM" },
      { name: "Taxi Juan", desc: "Taxi driver — referrals & earnings", color: "#1e3a5f", badge: "REFERRER", initials: "TJ" },
      { name: "Sophie Chen", desc: "Hotel concierge — referrals & commissions", color: "#4c1d6b", badge: "REFERRER", initials: "SC" },
      { name: "Panama City Tours", desc: "Tour guide operator — referrals & earnings", color: "#065f46", badge: "REFERRER", initials: "PT" },
    ]
  }
];

export function HierarchyClear() {
  return (
    <div className="w-[440px] max-w-full mx-auto min-h-screen bg-[#1a1614] text-neutral-100 font-sans flex flex-col shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-5 border-b border-white/[0.08] bg-black/20 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded bg-[#c41e3a] flex items-center justify-center shadow-lg shadow-[#c41e3a]/20">
            <span className="font-bold text-white text-[10px] tracking-widest">OKÜ</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white leading-none">Platform Demo</h1>
            <p className="text-[13px] text-neutral-400 mt-1">Authentication Gateway</p>
          </div>
        </div>
        
        <div className="bg-[#c41e3a]/10 border border-[#c41e3a]/20 rounded-lg p-3 mt-4 flex items-start gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#c41e3a] mt-1.5 shrink-0 animate-pulse"></div>
          <p className="text-[12px] text-neutral-300 leading-snug">
            <strong className="text-white font-medium">Demo environment.</strong> Click any persona below to log in instantly — no password required.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 space-y-8 overflow-y-auto pb-12 custom-scrollbar">
        {groups.map((group, idx) => (
          <div key={idx} className="space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 shrink-0">
                {group.title}
              </h2>
              <div className="h-px bg-white/[0.06] flex-1"></div>
            </div>
            
            <div className="space-y-2">
              {group.personas.map((persona, pIdx) => (
                <button
                  key={pIdx}
                  className="w-full text-left group flex items-center gap-3.5 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/10 transition-all duration-200 active:scale-[0.98]"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm transition-transform duration-300 group-hover:scale-105"
                    style={{ 
                      backgroundColor: persona.color, 
                      borderColor: persona.borderColor || 'rgba(255,255,255,0.15)' 
                    }}
                  >
                    <span className="text-xs font-semibold text-white tracking-wide">
                      {persona.initials}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-sm font-medium text-neutral-100 truncate pr-2 group-hover:text-white transition-colors">
                        {persona.name}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 tracking-wider shrink-0">
                        {persona.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate group-hover:text-neutral-400 transition-colors">
                      {persona.desc}
                    </p>
                  </div>
                  
                  <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-neutral-300 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
