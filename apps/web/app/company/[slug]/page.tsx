import Practice from '../../../components/practice';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Practice slug={slug} />;
}
