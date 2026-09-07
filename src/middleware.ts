import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/products/:path*",
    "/vendors/:path*",
    "/quotes/:path*",
    "/inbox/:path*",
    "/rfq/:path*",
  ],
};
