import { SignIn } from "@clerk/nextjs";

export default function AdminSignInPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F8FAFC]">
      <SignIn />
    </div>
  );
}
