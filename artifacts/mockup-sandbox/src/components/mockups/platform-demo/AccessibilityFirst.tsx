import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const personas = [
  {
    name: "Superadmin",
    description: "Full system access — all modules",
    color: "#1a1614",
    badge: "SUPERADMIN",
    initials: "SA",
  },
  {
    name: "Admin Commercial",
    description: "Series, orders, payouts management",
    color: "#7c3aed",
    badge: "ADMIN",
    initials: "AC",
  },
  {
    name: "Admin IR",
    description: "Investor relations & documents",
    color: "#1d4ed8",
    badge: "ADMIN",
    initials: "AI",
  },
  {
    name: "Admin HR",
    description: "Jobs, applications & staff",
    color: "#059669",
    badge: "ADMIN",
    initials: "AH",
  },
  {
    name: "Influencer",
    description: "Dashboard, referrals & commissions",
    color: "#c41e3a",
    badge: "CREATOR",
    initials: "IN",
  },
  {
    name: "Partner",
    description: "Partner dashboard & co-hosted series",
    color: "#d97706",
    badge: "PARTNER",
    initials: "PA",
  },
  {
    name: "Investor",
    description: "IR document portal & reports",
    color: "#0891b2",
    badge: "INVESTOR",
    initials: "IV",
  },
  {
    name: "Staff (OKÜ)",
    description: "SOPs, training & operations",
    color: "#64748b",
    badge: "STAFF",
    initials: "ST",
  },
  {
    name: "Attendee",
    description: "Browse series, buy tickets & orders",
    color: "#c41e3a",
    badge: "GUEST",
    initials: "AT",
  },
  {
    name: "Carlos Mendez",
    description: "Streetside host — referrals & commissions",
    color: "#854d0e",
    badge: "REFERRER",
    initials: "CM",
  },
  {
    name: "Taxi Juan",
    description: "Taxi driver — referrals & earnings",
    color: "#1e3a5f",
    badge: "REFERRER",
    initials: "TJ",
  },
  {
    name: "Sophie Chen",
    description: "Hotel concierge — referrals & commissions",
    color: "#4c1d6b",
    badge: "REFERRER",
    initials: "SC",
  },
  {
    name: "Panama City Tours",
    description: "Tour guide operator — referrals & earnings",
    color: "#065f46",
    badge: "REFERRER",
    initials: "PT",
  },
];

export function AccessibilityFirst() {
  return (
    <div className="w-[440px] max-w-full bg-white min-h-screen pb-12 font-sans overflow-y-auto">
      {/* High-contrast header */}
      <div className="bg-[#1a1614] text-white p-6 border-b-4 border-[#c41e3a]">
        <h1 className="text-[24px] font-bold mb-2">Platform Demo</h1>
        <p className="text-[15px] leading-relaxed">
          Welcome to the OKÜ Hospitality Group platform preview.
        </p>
        <div className="mt-4 p-3 bg-white/10 rounded border border-white/20">
          <p className="text-[13px] font-medium">
            This is a demo environment. Click any persona to log in instantly — no password required.
          </p>
        </div>
      </div>

      <div className="p-6">
        {/* Single-column clear list */}
        <div className="flex flex-col space-y-4">
          {personas.map((persona, index) => (
            <Card
              key={index}
              className="flex items-center p-4 cursor-pointer hover:bg-gray-50 border-2 border-gray-200 transition-colors rounded-lg shadow-sm"
              onClick={() => console.log(`Logging in as ${persona.name}`)}
              role="button"
              tabIndex={0}
              aria-label={`Log in as ${persona.name}, role: ${persona.badge}, description: ${persona.description}`}
            >
              {/* High contrast 48px avatar */}
              <Avatar className="h-12 w-12 rounded-full border-2 border-transparent mr-4 flex-shrink-0" style={{ backgroundColor: persona.color }}>
                <AvatarFallback className="text-white font-bold text-lg bg-transparent">
                  {persona.initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[16px] font-bold text-gray-900 truncate pr-2">
                    {persona.name}
                  </span>
                  {/* High contrast pill badge */}
                  <Badge 
                    className="flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full" 
                    style={{ 
                      backgroundColor: persona.color,
                      color: "#ffffff"
                    }}
                  >
                    {persona.badge}
                  </Badge>
                </div>
                <p className="text-[14px] font-medium text-gray-700 leading-snug">
                  {persona.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
