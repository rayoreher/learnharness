import { handleCourseRequest } from "@/course-app/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleCourseRequest(request);
export const POST = (request: Request) => handleCourseRequest(request);
