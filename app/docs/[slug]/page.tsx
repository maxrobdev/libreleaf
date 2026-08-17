import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteNav } from "../../components/SiteNav";
import { TechnicalDocArticle } from "../../../components/TechnicalDocs";
import { getTechnicalDoc, technicalDocs } from "../../../content/technical-docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return technicalDocs.map((document) => ({ slug: document.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> | { slug: string } }): Promise<Metadata> {
  const { slug } = await params;
  const document = getTechnicalDoc(slug);
  if (!document) return {};
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: `/docs/${document.slug}` },
    openGraph: {
      type: "article",
      title: document.title,
      description: document.description,
      url: `/docs/${document.slug}`,
      publishedTime: "2026-08-17",
      modifiedTime: document.updated,
    },
  };
}

export default async function TechnicalDocumentationPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = await params;
  const document = getTechnicalDoc(slug);
  if (!document) notFound();
  return <><SiteNav active="docs" /><TechnicalDocArticle document={document} /></>;
}
