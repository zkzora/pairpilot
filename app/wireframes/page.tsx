import type { Metadata } from "next";
import WireframeBoard from "./board";

export const metadata: Metadata = { title: "PairPilot — Design wireframes", robots: { index: false, follow: false } };
export default function WireframesPage() { return <WireframeBoard />; }
