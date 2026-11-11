import Image from "next/image";
import Link from "next/link";
import logo from "@/app/logo.svg";

// Brand logo from app/logo.svg with the name beside it. The image is decorative because the text already names the link.
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-3">
      <Image src={logo} alt="" priority className="h-12 w-auto" />
      <span className="text-lg font-semibold tracking-tight text-gray-900">Riverside Barbers</span>
    </Link>
  );
}
