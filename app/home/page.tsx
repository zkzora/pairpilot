import type { Metadata } from "next";
import Landing from "./landing";

export const metadata: Metadata = {
  title: "PairPilot — Two positions. One clear plan.",
  description: "A focused workspace for long/short perp pairs on dreamDEX. Review two legs, follow actual fills, and manage remaining exposure on Somnia Tokyo testnet.",
};

export default function HomePage() { return <Landing />; }
