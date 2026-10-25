import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const $ = id => document.getElementById(id);
const FRAME_METRES = 6;
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let currentUser = null, currentProfile = null;

function message(id, text = "", kind = "") { const el = $(id); el.textContent = text; el.className = `message ${kind}`.trim(); }
function show(id, yes) { $(id).classList.toggle("hidden", !yes); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function metres(count) { return `${(Number(count || 0) * FRAME_METRES).toLocaleString()} metres`; }
function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function signedOut() { currentUser = currentProfile = null; show("loginPanel",true); show("appPanel",false); message("loginMessage"); }
async function profileFor(user) {
  const {data,error} = await supabase.from("profiles").select("id,full_name,worker_code,role").eq("id",user.id).maybeSingle();
  if(error) throw error;
  if(!data || !["admin","worker"].includes(data.role)) throw new Error("Profile missing or role invalid. Ask the administrator to create a profiles row for this user.");
  return data;
}
async function signedIn(profile) {
  currentProfile = profile;
  show("loginPanel",false); show("appPanel",true);
  $("welcomeHeading").textContent = profile.full_name || currentUser.email || "User";
  $("roleMessage").textContent = `Role: ${profile.role}`;
  show("workerPanel",profile.role==="worker"); show("workerHistoryPanel",profile.role==="worker"); show("adminPanel",profile.role==="admin");
  if(profile.role==="worker") { $("workerName").value = profile.full_name || ""; await loadWorkerHistory(); }
  if(profile.role==="admin") await loadAdminHistory();
}
function photoFiles() { return Array.from($("machinePhotos").files || []); }
function previewPhotos() {
  $("photoPreview").replaceChildren();
  const files = photoFiles();
  $("photoCount").textContent = files.length ? `${files.length} photo(s) selected` : "No photos selected";
  for(const file of files) { if(!file.type.startsWith("image/")) continue; const img=document.createElement("img"); img.alt=file.name; img.src=URL.createObjectURL(file); img.onload=()=>URL.revokeObjectURL(img.src); $("photoPreview").appendChild(img); }
}
function validate() {
  const v={workerName:$("workerName").value.trim(),machineNumber:$("machineNumber").value.trim(),workDate:$("workDate").value,workCount:Number($("workCount").value),stitchCount:Number($("stitchCount").value),files:photoFiles()};
  if(!v.workerName || !v.machineNumber || !v.workDate) throw Error("Complete worker name, machine number and work date.");
  if(!Number.isInteger(v.workCount)||v.workCount<0) throw Error("Work count must be a non-negative whole number.");
  if(!Number.isInteger(v.stitchCount)||v.stitchCount<0) throw Error("Stitch count must be a non-negative whole number.");
  if(v.files.length<2||v.files.length>12) throw Error("Select between 2 and 12 photos.");
  if(v.files.some(f=>!f.type.startsWith("image/"))) throw Error("All selected files must be images.");
  if(v.files.some(f=>f.size>10*1024*1024)) throw Error("Each photo must be 10 MB or smaller.");
  return v;
}
async function saveWork(e) {
  e.preventDefault(); message("workMessage"); const btn=$("saveWorkButton"); btn.disabled=true; btn.textContent="Saving…"; let recordId=null;
  try {
    if(!currentUser) throw Error("Please sign in again.");
    const v=validate();
    const {data,error}=await supabase.from("daily_work_records").insert({
      worker_id:currentUser.id,worker_name:v.workerName,worker_mobile:$("workerMobile").value.trim()||null,
      machine_number:v.machineNumber,work_date:v.workDate,work_count:v.workCount,stitch_count:v.stitchCount,
      machine_time:$("machineTime").value.trim()||null,placement:$("placement").value.trim()||null,
      fabric_length_metres:v.workCount*FRAME_METRES
    }).select("id").single();
    if(error) throw error; recordId=data.id;
    const photoRows=[];
    for(let i=0;i<v.files.length;i++){
      const f=v.files[i], safe=f.name.replace(/[^a-zA-Z0-9._-]/g,"_"), path=`${currentUser.id}/${recordId}/${Date.now()}-${i}-${safe}`;
      const {error:uploadError}=await supabase.storage.from("machine-photos").upload(path,f,{upsert:false,contentType:f.type});
      if(uploadError) throw Error(`Record was created, but photo ${i+1} failed to upload: ${uploadError.message}`);
      photoRows.push({work_record_id:recordId,uploaded_by:currentUser.id,storage_path:path,file_name:f.name,content_type:f.type,file_size:f.size});
    }
    const {error:photoError}=await supabase.from("daily_work_photos").insert(photoRows);
    if(photoError) throw Error(`Photos uploaded, but photo details failed to save: ${photoError.message}`);
    $("workForm").reset(); $("workDate").value=today(); $("photoPreview").replaceChildren(); $("photoCount").textContent="No photos selected"; $("fabricLengthPreview").textContent="0 metres";
    message("workMessage","Record and photos saved successfully.","success"); await loadWorkerHistory();
  } catch(err) { message("workMessage",`${err.message || "Could not save record."}${recordId?` Record ID: ${recordId}. Check before retrying to avoid duplicates.`:""}`,"error"); }
  finally { btn.disabled=false; btn.textContent="Save work record"; }
}
async function photoMapFor(ids) {
  const map={}; if(!ids.length)return map;
  const {data,error}=await supabase.from("daily_work_photos").select("work_record_id,storage_path").in("work_record_id",ids);
  if(error)throw error;
  for(const p of data||[]){const {data:s}=await supabase.storage.from("machine-photos").createSignedUrl(p.storage_path,1800);if(s?.signedUrl)(map[p.work_record_id]||=[]).push(s.signedUrl);}
  return map;
}
function links(urls){return urls?.length?urls.map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Photo ${i+1}</a>`).join(", "):"—";}
async function loadAdminHistory() {
  if(!supabase||currentProfile?.role!=="admin")return; message("historyMessage","Loading…");
  try{
    let q=supabase.from("daily_work_records").select("id,worker_name,machine_number,work_date,work_count,stitch_count").order("work_date",{ascending:false}).limit(500);
    if($("filterFrom").value)q=q.gte("work_date",$("filterFrom").value);if($("filterTo").value)q=q.lte("work_date",$("filterTo").value);
    const {data,error}=await q;if(error)throw error;
    const term=$("filterSearch").value.trim().toLowerCase(), rows=(data||[]).filter(r=>!term||r.worker_name.toLowerCase().includes(term)||r.machine_number.toLowerCase().includes(term));
    const photos=await photoMapFor(rows.map(r=>r.id));
    $("historyRows").innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.work_date)}</td><td>${esc(r.worker_name)}</td><td>${esc(r.machine_number)}</td><td>${r.work_count}</td><td>${r.stitch_count}</td><td>${esc(metres(r.work_count))}</td><td>${links(photos[r.id])}</td></tr>`).join(""):'<tr><td colspan="7">No records found.</td></tr>';
    message("historyMessage",`${rows.length} record(s) shown.`,"success");
  }catch(err){message("historyMessage",err.message||"Could not load history.","error");}
}
async function loadWorkerHistory() {
  if(!supabase||!currentUser||currentProfile?.role!=="worker")return; message("workerHistoryMessage","Loading…");
  try{
    const {data,error}=await supabase.from("daily_work_records").select("id,machine_number,work_date,work_count,stitch_count").eq("worker_id",currentUser.id).order("work_date",{ascending:false}).limit(200);
    if(error)throw error;const rows=data||[],photos=await photoMapFor(rows.map(r=>r.id));
    $("workerHistoryRows").innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.work_date)}</td><td>${esc(r.machine_number)}</td><td>${r.work_count}</td><td>${r.stitch_count}</td><td>${esc(metres(r.work_count))}</td><td>${links(photos[r.id])}</td></tr>`).join(""):'<tr><td colspan="6">No work records found.</td></tr>';
    message("workerHistoryMessage",`${rows.length} record(s) shown.`,"success");
  }catch(err){message("workerHistoryMessage",err.message||"Could not load history.","error");}
}
async function login(e) {
  e.preventDefault();message("loginMessage");$("loginButton").disabled=true;
  try{const {data,error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error)throw error;currentUser=data.user;await signedIn(await profileFor(currentUser));}
  catch(err){await supabase.auth.signOut();signedOut();message("loginMessage",err.message||"Sign-in failed.","error");}
  finally{$("loginButton").disabled=false;}
}
async function logout(){if(supabase)await supabase.auth.signOut();signedOut();}
async function init(){
  if(!supabase){show("setupNotice",true);signedOut();return;}
  try{const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session){signedOut();return;}currentUser=data.session.user;await signedIn(await profileFor(currentUser));}
  catch(err){signedOut();message("loginMessage",err.message||"Could not restore session.","error");}
}
$("loginForm").addEventListener("submit",login);$("logoutButton").addEventListener("click",logout);$("workForm").addEventListener("submit",saveWork);
$("machinePhotos").addEventListener("change",previewPhotos);$("workCount").addEventListener("input",()=>$("fabricLengthPreview").textContent=metres($("workCount").value));
$("refreshHistoryButton").addEventListener("click",loadAdminHistory);$("filterFrom").addEventListener("change",loadAdminHistory);$("filterTo").addEventListener("change",loadAdminHistory);$("filterSearch").addEventListener("input",loadAdminHistory);$("refreshWorkerHistoryButton").addEventListener("click",loadWorkerHistory);
$("workDate").value=today();init();

async function registerWorker(e) {
  e.preventDefault();
  message("registerMessage");

  const button = $("registerButton");
  button.disabled = true;
  button.textContent = "Creating account…";

  try {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const fullName = $("registerName").value.trim();
    const email = $("registerEmail").value.trim().toLowerCase();
    const password = $("registerPassword").value;
    const confirmation = $("confirmPassword").value;

    if (!fullName) {
      throw new Error("Please enter your full name.");
    }

    if (password.length < 8) {
      throw new Error("Password must contain at least 8 characters.");
    }

    if (password !== confirmation) {
      throw new Error("Passwords do not match.");
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) throw error;

    if (data.session && data.user) {
      currentUser = data.user;
      const profile = await profileFor(currentUser);
      await signedIn(profile);

      message(
        "registerMessage",
        "Account created successfully.",
        "success"
      );
    } else {
      message(
        "registerMessage",
        "Registration submitted. Check your email to confirm your account before signing in, if confirmation is required.",
        "success"
      );
    }

    $("registerForm").reset();
  } catch (err) {
    message(
      "registerMessage",
      err.message || "Registration failed.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Create worker account";
  }
}

$("registerForm").addEventListener("submit", registerWorker);
