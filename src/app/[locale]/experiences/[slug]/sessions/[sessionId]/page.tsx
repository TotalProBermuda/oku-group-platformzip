// The shared page uses the path sessionId to render only that session.
// No redirect: direct visits and refreshes retain the nested event URL.
export { default, generateMetadata } from "@/app/[locale]/experiences/[slug]/page";
