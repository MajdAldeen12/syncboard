import type { Metadata } from "next";
import { DemoBoard } from "@/features/board/demo-board";

export const metadata: Metadata = {
  title: "Demo board · SyncBoard",
};

export default function DemoPage() {
  return <DemoBoard />;
}
