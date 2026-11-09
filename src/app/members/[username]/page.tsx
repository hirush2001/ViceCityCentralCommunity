import MemberProfile from "@/components/member-profile";

export default async function MemberPage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <MemberProfile username={decodeURIComponent(username)} />;
}
