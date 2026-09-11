import { NextResponse } from "next/server";

// CyberSource's ACS returns the result inside the checkout iframe. This page
// exposes no request data; it only notifies the parent that it may ask the
// server to validate the authentication transaction.
const page = `<!doctype html><html><body><script>window.parent.postMessage({type:"oku-3ds-complete"}, "https://www.okuhospitalitygroup.com");</script></body></html>`;

export async function GET() { return new NextResponse(page, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }); }
export async function POST() { return new NextResponse(page, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }); }
