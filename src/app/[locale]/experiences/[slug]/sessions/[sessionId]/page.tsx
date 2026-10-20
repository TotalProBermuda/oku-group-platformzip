import ExperienceDetailPage, { generateMetadata as generateExperienceMetadata } from "../../page";

type Props = {
  params: Promise<{ locale: string; slug: string; sessionId: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale, slug, sessionId } = await params;
  return generateExperienceMetadata({
    params: Promise.resolve({ locale, slug }),
    searchParams: Promise.resolve({ sessionId }),
  });
}

export default async function SessionEventPage({ params }: Props) {
  const { locale, slug, sessionId } = await params;
  return ExperienceDetailPage({
    params: Promise.resolve({ locale, slug }),
    searchParams: Promise.resolve({ sessionId }),
  });
}
