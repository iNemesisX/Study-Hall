// Sets the icon and version details on the packaged .exe without needing Windows.
// Usage: node build/stamp-exe.mjs "<path to Study Hall.exe>"
import fs from 'node:fs';
import * as PELibrary from 'pe-library';
import * as ResEdit from 'resedit';

const exePath = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PELibrary.NtExecutableResource.from(exe);

const ico = ResEdit.Data.IconFile.from(fs.readFileSync(new URL('./icon.ico', import.meta.url)));
for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, ico.icons.map(i => i.data));
}
const [major, minor, patch] = pkg.version.split('.').map(Number);
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
vi.setFileVersion(major, minor, patch, 0, 1033);
vi.setProductVersion(major, minor, patch, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: pkg.productName, ProductName: pkg.productName, CompanyName: pkg.author,
  InternalName: pkg.productName, OriginalFilename: `${pkg.productName}.exe`, LegalCopyright: `Copyright © ${new Date().getFullYear()} ${pkg.author}`,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('stamped', exePath);
