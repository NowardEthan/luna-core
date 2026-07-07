import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const UID = "aKp1czWVMqWQdJ9nAIcIKgxKNu92";
const CONVERSATION_ID = "e3b6c900-9cc2-4f3d-834a-5bebdd388317";
const SERVICE_ACCOUNT_PATH = "C:/Users/ethan/Documents/Projects/Luna/docs/luna-8787d-firebase-adminsdk-fbsvc-afca4bb62b.json";

if (getApps().length === 0) {
  initializeApp({
    credential: cert(SERVICE_ACCOUNT_PATH),
  });
}

const db = getFirestore();

async function main() {
  const messagesRef = db.collection(`users/${UID}/conversations/${CONVERSATION_ID}/messages`);
  const snap = await messagesRef.get();
  console.error(`Found ${snap.size} messages`);

  const messages = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt ?? data.created_at ?? data.timestamp ?? data.date;
    return {
      id: d.id,
      role: data.role,
      text: typeof data.text === "string" ? data.text : (typeof data.content === "string" ? data.content : ""),
      created_at: createdAt?.toDate?.()?.toISOString() ?? createdAt,
      fields: Object.keys(data),
      attachments: data.attachments ? JSON.stringify(data.attachments).slice(0, 500) : undefined,
    };
  });

  messages.sort((a, b) => {
    if (a.created_at && b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  const outPath = "C:/Users/ethan/Documents/Projects/Luna/conversa_exportada.json";
  fs.writeFileSync(outPath, JSON.stringify(messages, null, 2), "utf8");
  console.error(`Saved to ${outPath}`);
  console.log(JSON.stringify(messages.slice(0, 3), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
