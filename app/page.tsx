"use client";
import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  image?: string;
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // حالات التحميل والتحكم الجديدة UI/UX
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"text" | "image">("text");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  
  // حالات تعديل الرسائل
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const API_URL = "https://fatttta123-nove-backend.hf.space";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // دالة نسخ النصوص
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // بدء عملية تعديل الرسالة
  const startEditing = (index: number, text: string) => {
    setEditingIndex(index);
    setEditingText(text);
  };

  // حفظ الرسالة المعدلة وإعادة إرسالها فوراً
  const handleSaveEdit = async (index: number) => {
    if (!editingText.trim()) return;
    
    const updatedMessages = [...messages];
    updatedMessages[index].content = editingText;
    
    setMessages(updatedMessages.slice(0, index + 1));
    setEditingIndex(null);
    
    await sendMessage(editingText);
  };

  // دالة طلب إجابة أخرى
  const handleRegenerate = async (currentIndex: number) => {
    let lastUserMessage = "";
    for (let i = currentIndex; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessage = messages[i].content;
        setMessages(messages.slice(0, i + 1));
        break;
      }
    }
    
    if (lastUserMessage) {
      await sendMessage(lastUserMessage);
    }
  };

  // معالجة اختيار الملفات من المشبك
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      setSelectedImage(file);
      setSelectedDocument(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedDocument(file);
      setSelectedImage(null);
      setImagePreview("");
    }
  };

    const sendMessage = async (overrideInput?: string) => {
    const textToSubmit = overrideInput || input;

    // 1. معالجة الملفات الصوتية المحددة مسبقاً
    if (selectedAudio) {
      setIsLoading(true);
      setLoadingType("text");
      const formData = new FormData();
      formData.append("file", selectedAudio);
      try {
        const response = await fetch(`${API_URL}/transcribe-audio`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        setInput(data.response);
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: "فشل تحليل الصوت." }]);
      } finally {
        setIsLoading(false);
      }
      setSelectedAudio(null);
      return;
    }

    // 2. معالجة المستندات
    if (selectedDocument) {
      setIsLoading(true);
      setLoadingType("text");
      setMessages((prev) => [...prev, { role: "user", content: `📄 ${selectedDocument.name}\n${textToSubmit}` }]);
      const formData = new FormData();
      formData.append("file", selectedDocument);
      formData.append("question", textToSubmit);
      try {
        const response = await fetch(`${API_URL}/upload-document`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        setInput("");
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: "حدث خطأ." }]);
      } finally {
        setIsLoading(false);
      }
      setSelectedDocument(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 3. معالجة الصور المرفوعة
    if (selectedImage) {
      setIsLoading(true);
      setLoadingType("text");
      const formData = new FormData();
      formData.append("file", selectedImage);
      formData.append("question", textToSubmit || "اشرح الصورة");

      setMessages((prev) => [...prev, { role: "user", content: `📷 صورة\n\n❓ ${textToSubmit || "اشرح الصورة"}` }]);
      setInput("");

      try {
        const response = await fetch(`${API_URL}/analyze-image`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: "حدث خطأ في تحليل الصورة." }]);
      } finally {
        setIsLoading(false);
      }
      setSelectedImage(null);
      setImagePreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 4. 🔥 معالجة ذكية لطلبات توليد الصور (عبر التقاط الكلمات المفتاحية)
    const textLower = textToSubmit.trim().toLowerCase();
    if (
      textLower.includes("انشئ") ||
      textLower.includes("أنشئ") ||
      textLower.includes("صورة") ||
      textLower.includes("صوره") ||
      textLower.includes("ولد") ||
      textLower.includes("ارسم")
    ) {
      if (!overrideInput) {
        setMessages((prev) => [...prev, { role: "user", content: textToSubmit }]);
      }
      setInput("");
      setIsLoading(true);
      setLoadingType("image");
      
      const formData = new FormData();
      formData.append("prompt", textToSubmit);
      try {
        const response = await fetch(`${API_URL}/generate-image`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.image_url) {
          setMessages((prev) => [
             ...prev,
              { 
              role: "assistant", 
              content: "🎨 تم توليد الصورة بنجاح بناءً على طلبك:", 
              image: `${API_URL}${data.image_url}` // دمج الرابط هنا أيضاً
            }
          ]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ لم يتم استلام رابط الصورة بشكل صحيح." }]);
        }
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: "حدث خطأ أثناء إنشاء الصورة." }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 5. رسائل المحادثة العادية والـ Chat الذكي (استقبال روابط الصور من دالة الشات العادية أيضاً)
    if (!textToSubmit.trim()) return;
    if (!overrideInput) {
      setMessages((prev) => [...prev, { role: "user", content: textToSubmit }]);
    }
    setInput("");
    setIsLoading(true);
    setLoadingType("text");

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSubmit }),
      });
            const data = await response.json();
      
      // ✨ التعديل السحري والنهائي لعرض الصورة
      setMessages((prev) => [
        ...prev, 
        { 
          role: "assistant", 
          content: data.response, 
          // دمج رابط السيرفر الخارجي مع مسار الصورة لكي تظهر فوراً
          image: data.image_url ? `${API_URL}${data.image_url}` : undefined 
        }
      ]);
} catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "حدث خطأ في اتصال السيرفر." }]);
    } finally {
      setIsLoading(false);
    }
  };


  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const audioFile = new File([audioBlob], "recording.webm", { type: "audio/webm" });
          setSelectedAudio(audioFile);

          const formData = new FormData();
          formData.append("file", audioFile);
          setIsLoading(true);

          try {
            const response = await fetch(`${API_URL}/transcribe-audio`, {
              method: "POST",
              body: formData,
            });
            const data = await response.json();
            setInput(data.response);
            setSelectedAudio(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: "فشل تحويل التسجيل." }]);
          } finally {
            setIsLoading(false);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch {
        alert("يرجى تفعيل صلاحية استخدام المايكروفون للتسجيل.");
      }
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

 return (
    <div className="flex h-screen bg-[#f7f7f8]" dir="rtl">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-64" : "w-0"} overflow-hidden transition-all duration-300 border-l bg-white`}>
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">✨ Nova</h1>
          <button
            onClick={() => setMessages([])}
            className="w-full rounded-xl bg-gray-100 p-3 text-right text-gray-800 hover:bg-gray-200">
            + محادثة جديدة
          </button>
          <div className="mt-6 space-y-2">
            {["محادثة 1", "محادثة 2", "محادثة 3"].map((c) => (
              <div key={c} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 cursor-pointer">
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 border-b bg-white px-5 py-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-2xl text-gray-800">☰</button>
          <h2 className="text-xl font-semibold text-gray-800">Nova</h2>
        </div>

        {/* Chat Area */}
        <div className="flex flex-1 flex-col px-6 py-4 overflow-y-auto bg-gray-50 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center">
              <h1 className="mb-3 text-4xl font-bold text-gray-800">مرحبًا 👋</h1>
              <p className="text-gray-500">كيف يمكنني مساعدتك اليوم؟</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                
                {/* الأيقونات الذكية (Avatars) */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shrink-0 ${
                  msg.role === "user" ? "bg-blue-600 text-white" : "bg-purple-600 text-white"
                }`}>
                  {msg.role === "user" ? "👤" : "✨"}
                </div>

                {/* صندوق الرسالة والتحكم */}
                <div className="flex flex-col space-y-1 max-w-xl group w-full">
                  
                  {/* وضع التعديل النشط لرسالة المستخدم */}
                  {editingIndex === i ? (
                    <div className="flex flex-col gap-2 bg-white p-3 border rounded-2xl shadow-sm w-full">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full p-2 border rounded-xl text-gray-800 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2 justify-end text-sm">
                        <button 
                          onClick={() => handleSaveEdit(i)} 
                          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
                          حفظ وإرسال 🚀
                        </button>
                        <button 
                          onClick={() => setEditingIndex(null)} 
                          className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* وضع العرض العادي للرسالة */
                    <div className={`rounded-2xl px-5 py-3 text-base shadow-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user" ? "bg-blue-600 text-white" : "bg-white text-gray-800 border"
                    }`}>
                      {msg.content}
                      {msg.image && (
                        <img src={msg.image} alt="Generated" className="mt-3 rounded-lg max-w-full h-auto shadow" />
                      )}
                    </div>
                  )}

                  {/* أزرار التحكم السريع تظهر عند تمرير الفأرة (Hover) في وضع العرض العادي فقط */}
                  {editingIndex !== i && (
                    <div className={`flex gap-3 px-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}>
                      <button 
                        onClick={() => copyToClipboard(msg.content, i)} 
                        className="hover:text-gray-600 flex items-center gap-1">
                        {copiedId === i ? "✓ تم النسخ" : "📋 نسخ"}
                      </button>
                      
                      {/* أزرار تحكم مخصصة للمستخدم فقط */}
                      {msg.role === "user" && (
                        <button 
                          onClick={() => startEditing(i, msg.content)} 
                          className="hover:text-gray-600 flex items-center gap-1">
                          ✏️ تعديل
                        </button>
                      )}

                      {/* زر طلب إجابة أخرى مخصص لردود البوت فقط */}
                      {msg.role === "assistant" && (
                        <button 
                          onClick={() => handleRegenerate(i)} 
                          className="hover:text-purple-600 text-gray-400 flex items-center gap-1 transition-colors">
                          🔄 إجابة أخرى
                        </button>
                      )}
                    </div>
                  )}
                </div>

              </div>
            ))
          )}

          {/* مؤشرات الانتظار الجذابة وقت الاتصال بالسيرفر */}
          {isLoading && (
            <div className="flex gap-4 flex-row">
              <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shadow-sm animate-pulse">
                ✨
              </div>
              <div className="bg-white border rounded-2xl px-5 py-3 text-base shadow-sm flex items-center gap-3 text-gray-500">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
                {loadingType === "image" ? (
                  <span className="animate-pulse font-medium text-purple-600">جاري توليد صورتك الذكية عبر Nova... 🎨</span>
                ) : (
                  <span className="animate-pulse font-medium">Nova يكتب الآن...</span>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar (القسم السفلي الخاص بالكتابة) */}
        <div className="border-t bg-white p-4">
          
          {/* صندوق المصغرات لعرض معاينات الملفات قبل الإرسال */}
          {(imagePreview || selectedDocument) && (
            <div className="max-w-4xl mx-auto mb-2 flex items-center gap-3 bg-gray-100 p-2 rounded-xl border">
              {imagePreview && <img src={imagePreview} alt="Preview" className="w-12 h-12 rounded object-cover border shadow-sm" />}
              {selectedDocument && <span className="text-sm font-medium text-gray-600 flex items-center gap-1">📄 {selectedDocument.name}</span>}
              <button 
                onClick={() => { setSelectedImage(null); setSelectedDocument(null); setImagePreview(""); }} 
                className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 mr-auto">
                إلغاء المرفق
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 max-w-4xl mx-auto border rounded-xl p-2 bg-gray-50 shadow-inner">
            {/* زر إرفاق الملفات الخفي والظاهري (المشبك 📎) */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 text-xl transition-colors"
              title="إرفاق ملف أو صورة">
              📎
            </button>

            {/* حقل النص المحدث أو الخطوط المموجة أثناء التسجيل */}
            {isRecording ? (
              <div className="flex-1 flex items-center justify-center gap-1.5 px-4 h-10 bg-red-50 rounded-lg">
                <span className="text-sm font-medium text-red-600 animate-pulse ml-2">جاري تسجيل الصوت...</span>
                {/* الخطوط المتحركة الممثلة للموجات الصوتية */}
                <div className="w-1 h-6 bg-red-500 rounded animate-[bounce_0.5s_infinite_100ms]"></div>
                <div className="w-1 h-4 bg-red-400 rounded animate-[bounce_0.5s_infinite_200ms]"></div>
                <div className="w-1 h-7 bg-red-600 rounded animate-[bounce_0.5s_infinite_300ms]"></div>
                <div className="w-1 h-5 bg-red-400 rounded animate-[bounce_0.5s_infinite_400ms]"></div>
                <div className="w-1 h-3 bg-red-500 rounded animate-[bounce_0.5s_infinite_500ms]"></div>
              </div>
            ) : (
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="اكتب رسالتك هنا..."
                className="flex-1 bg-transparent border-none outline-none px-2 text-gray-800"
                disabled={isLoading}
              />
            )}

            <button
              onClick={toggleRecording}
              className={`p-2 rounded-lg text-xl transition-all duration-300 ${isRecording ? "bg-red-500 text-white shadow-md scale-105" : "hover:bg-gray-200 text-gray-600"}`}>
              🎤
            </button>
            
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || isRecording}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
              إرسال
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}