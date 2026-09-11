import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const frame = formData.get("frame");

    if (!frame || !(frame instanceof File)) {
      return NextResponse.json(
        { error: 'Missing image file. Expected field "frame".' },
        { status: 400 }
      );
    }

    const backendFormData = new FormData();

    backendFormData.append("frame", frame);

    const response = await fetch(
      "http://127.0.0.1:8000/predict",
      {
        method: "POST",
        body: backendFormData,
      }
    );

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("FastAPI connection error:", error);

    return NextResponse.json(
      {
        error: "FastAPI backend unreachable",
        details: String(error),
      },
      { status: 500 }
    );
  }
}