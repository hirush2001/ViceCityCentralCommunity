import MemberConnections from "@/components/member-connections";

export default async function MemberConnectionsPage({
  params
}: {
  params: Promise<{ username: string; connection: string }>;
}) {
  const { username, connection } = await params;
  if (connection !== "followers" && connection !== "following") {
    return <MemberConnections username={decodeURIComponent(username)} connection="followers" />;
  }
  return <MemberConnections username={decodeURIComponent(username)} connection={connection} />;
}
