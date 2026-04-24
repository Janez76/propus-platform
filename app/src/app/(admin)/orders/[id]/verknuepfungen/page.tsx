import { notFound } from "next/navigation";
import { loadVerknuepfungenData } from "@/lib/repos/orders/verknuepfungenData";
import { VerknuepfungenView } from "./verknuepfungen-view";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

export default async function VerknuepfungenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const data = await loadVerknuepfungenData(id);
  if (!data) notFound();
  return <VerknuepfungenView orderId={id} data={data} searchParams={sp} />;
}
