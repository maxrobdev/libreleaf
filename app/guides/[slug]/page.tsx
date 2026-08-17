import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGuide, guides } from "../../../content/guides";
import { GuideArticle } from "../../../components/Guides";
import { SiteNav } from "../../components/SiteNav";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> | { slug: string } }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: { type: "article", title: guide.title, description: guide.description, url: `/guides/${guide.slug}`, publishedTime: guide.published, modifiedTime: guide.updated },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return <><SiteNav active="guides" /><GuideArticle guide={guide} /></>;
}
