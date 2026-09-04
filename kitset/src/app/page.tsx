import { getBots } from "@/lib/catalog";
import { site } from "@/lib/site";
import { BotCard } from "./bot-card";

export default function HomePage() {
  const bots = getBots();

  return (
    <div>
      <h1 className="text-3xl font-bold">{site.name}</h1>
      <p className="mt-4 text-ink leading-relaxed">
        {site.name} sells pre-built AI bots as a one-time purchase. You pay once,
        you get the bot files and a written setup manual, and you install it on
        your own accounts using your own keys. {site.name} hosts nothing for you
        and the bot never checks in with us, so once you have bought it, it is
        yours and it keeps running.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Catalog</h2>
      <div className="mt-4 grid gap-3">
        {bots.map((bot) => (
          <BotCard key={bot.slug} bot={bot} />
        ))}
      </div>
    </div>
  );
}
