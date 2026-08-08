import React from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PERSONAS = [
  {
    name: "Superadmin",
    description: "Full system access — all modules",
    color: "#1a1614",
    badge: "SUPERADMIN",
  },
  {
    name: "Admin Commercial",
    description: "Series, orders, payouts management",
    color: "#7c3aed",
    badge: "ADMIN",
  },
  {
    name: "Admin IR",
    description: "Investor relations & documents",
    color: "#1d4ed8",
    badge: "ADMIN",
  },
  {
    name: "Admin HR",
    description: "Jobs, applications & staff",
    color: "#059669",
    badge: "ADMIN",
  },
  {
    name: "Influencer",
    description: "Dashboard, referrals & commissions",
    color: "#c41e3a",
    badge: "CREATOR",
  },
  {
    name: "Partner",
    description: "Partner dashboard & co-hosted series",
    color: "#d97706",
    badge: "PARTNER",
  },
  {
    name: "Investor",
    description: "IR document portal & reports",
    color: "#0891b2",
    badge: "INVESTOR",
  },
  {
    name: "Staff (OKÜ)",
    description: "SOPs, training & operations",
    color: "#64748b",
    badge: "STAFF",
  },
  {
    name: "Attendee",
    description: "Browse series, buy tickets & orders",
    color: "#c41e3a",
    badge: "GUEST",
  },
  {
    name: "Carlos Mendez",
    description: "Streetside host — referrals & commissions",
    color: "#854d0e",
    badge: "REFERRER",
  },
  {
    name: "Taxi Juan",
    description: "Taxi driver — referrals & earnings",
    color: "#1e3a5f",
    badge: "REFERRER",
  },
  {
    name: "Sophie Chen",
    description: "Hotel concierge — referrals & commissions",
    color: "#4c1d6b",
    badge: "REFERRER",
  },
  {
    name: "Panama City Tours",
    description: "Tour guide operator — referrals & earnings",
    color: "#065f46",
    badge: "REFERRER",
  },
];

export function AffordanceFirst() {
  return (
    <div className="w-[440px] max-w-full mx-auto min-h-screen bg-[#1a1614] text-white flex flex-col font-sans relative overflow-hidden">
      {/* Header */}
      <header className="pt-12 pb-6 px-6 z-10 sticky top-0 bg-[#1a1614]/95 backdrop-blur-md border-b border-white/10">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Sign in as…
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-[90%]">
          Platform Demo environment. Click any persona to log in instantly — no password required.
        </p>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-20 space-y-3 z-0">
        {PERSONAS.map((persona, i) => (
          <button
            key={i}
            className="group w-full relative flex items-center bg-[#24201e] hover:bg-[#2d2826] active:bg-[#342f2d] active:scale-[0.98] transition-all duration-200 rounded-2xl overflow-hidden border border-white/5 hover:border-white/15 text-left h-[80px]"
            onClick={() => console.log(`Logging in as ${persona.name}`)}
          >
            {/* Color Accent Bar */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2.5 transition-all duration-300 group-hover:w-3"
              style={{ backgroundColor: persona.color }}
            />
            
            <div className="flex-1 pl-6 pr-4 py-3 flex flex-col justify-center h-full">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[16px] text-white truncate pr-2 tracking-wide">
                  {persona.name}
                </span>
                <Badge 
                  variant="secondary" 
                  className="bg-white/10 hover:bg-white/20 text-white/90 text-[10px] uppercase tracking-wider font-bold py-0.5 px-2 rounded-full border-none whitespace-nowrap"
                  style={persona.badge === 'SUPERADMIN' ? { backgroundColor: 'rgba(196, 30, 58, 0.2)', color: '#ff8a9f' } : {}}
                >
                  {persona.badge}
                </Badge>
              </div>
              <span className="text-[13px] text-gray-400 truncate">
                {persona.description}
              </span>
            </div>

            {/* Chevron */}
            <div className="pr-4 pl-2 text-gray-500 group-hover:text-white transition-colors duration-200">
              <ChevronRight className="w-5 h-5 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
            </div>
          </button>
        ))}
      </main>

      {/* Subtle bottom gradient for scroll hint */}
      <div className="fixed bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#1a1614] to-transparent pointer-events-none z-10" />
    </div>
  );
}
