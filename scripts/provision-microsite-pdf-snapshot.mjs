// Run from an authenticated Vercel project with its short-lived OIDC environment.
// This script provisions dependencies only. It accepts no document inputs.
import { Sandbox } from "@vercel/sandbox";

const image = "vercel/sandbox/python@sha256:726b9b750543bdd46d9035b212a8c141442b6689ba86e9df03b7b87c6e0b9bf2";
const shell = String.raw`
mkdir -p /vercel/pdf-deps
curl --fail --silent --show-error --location --max-time 25 \
  https://github.com/qpdf/qpdf/releases/download/v12.4.2/qpdf-12.4.2-bin-linux-x86_64.zip -o /tmp/qpdf.zip
printf '%s  %s\n' db367d897829f22c4198ce1094143c9d467bd6ee7dfabc44ba6f02056b24f8b1 /tmp/qpdf.zip | sha256sum -c
python3 - <<'PY'
import stat
from pathlib import Path
from zipfile import ZipFile
root = Path('/vercel/pdf-deps')
with ZipFile('/tmp/qpdf.zip') as archive:
    for entry in archive.infolist():
        destination = root / entry.filename
        assert destination.resolve().is_relative_to(root)
        if stat.S_ISLNK(entry.external_attr >> 16):
            target = archive.read(entry).decode()
            assert (destination.parent / target).resolve().is_relative_to(root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.symlink_to(target)
        else:
            archive.extract(entry, root)
PY
chmod +x /vercel/pdf-deps/bin/qpdf
/vercel/pdf-deps/bin/qpdf --version
command -v prlimit
command -v timeout
rm /tmp/qpdf.zip
`;

const sandbox = await Sandbox.create({
  image, architecture: "amd64", resources: { vcpus: 1 }, timeout: 90_000,
  persistent: false, networkPolicy: "allow-all", ports: [], mounts: {}, env: {},
});
try {
  const installation = await sandbox.runCommand({ cmd: "bash", args: ["-euc", shell] });
  if (installation.exitCode !== 0 || !(await installation.stdout()).includes("qpdf version 12.4.2")) {
    throw new Error("Pinned PDF inspector provisioning failed.");
  }
  await sandbox.update({ networkPolicy: "deny-all" });
  // Retain only the clean dependency artifact until an intentional update.
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(snapshot.snapshotId);
} finally {
  await sandbox.stop().catch(() => {});
}
