// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabaseClient';
import { validateInput, validateEmail, validatePassword, validateProfileData, validateMessage } from '../../utils/validation';
import { formatBB, getConnectionSortPriority, toTitleCase } from '../../utils/formatting';
import { GAME_CONFIG } from '../../gameConfig';
import ConfirmModal from '../ConfirmModal';

export default function ConnectionsScreen(p: Record<string, any>) {
  const { connectedUsers, gamePin, lastMessages, messageInput, messages, multiplayerActive, sbUser, screen, seatedRole, selectedChatUser, sendMessage, setMessageInput, setScreen, setSelectedChatUser, setShowDashboardConfirm, setShowTitleScreenConfirm, unreadCounts } = p;

  return (
    <main className="flex h-screen justify-center bg-black px-6 py-6 overflow-hidden">
      <div className="w-full max-w-[96rem] flex flex-col">
        <div className="mb-4 flex items-center justify-center gap-4 shrink-0">
          <h1 className="text-3xl font-bold text-white">Connections</h1>
          
          <button
            type="button"
            onClick={() => {
              if (gamePin || multiplayerActive) {
                setShowDashboardConfirm(true);
              } else {
                setScreen(seatedRole === "professional" ? "professionalDashboard" : "dashboard");
              }
            }}
            className="rounded-xl border border-white text-white px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-black"
          >
            Dashboard
          </button>
         <button
            type="button"
            onClick={() => {
              if (gamePin || multiplayerActive) {
                setShowTitleScreenConfirm(true);
              } else {
                setScreen("role");
              }
            }}
            className="rounded-xl border border-white text-white px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-gray-50 hover:text-black"
          >
            Title screen
          </button>
        </div>
        
        <p className="mb-8 text-center text-sm text-black/60">
          Message your connections
        </p>
        
        <div className="rounded-3xl border bg-white p-6 w-full flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-[350px_1fr] gap-6 h-full">
            
            {/* Left side - Connections list */}
            <div className="flex flex-col border-r pr-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-black/50 mb-4">
                Your Connections ({connectedUsers.length})
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2">
                {connectedUsers.length === 0 ? (
                  <div className="text-sm text-black/50 text-center py-8">
                    No connections yet. Connect with people from the Dashboard!
                  </div>
                ) : (
                  connectedUsers.map((user) => {
                    const lastMsg = lastMessages.get(user.id);
                    const unreadCount = unreadCounts.get(user.id) || 0;
                    
                    // Format date like LinkedIn
                    const formatDate = (dateStr: string) => {
                      const date = new Date(dateStr);
                      const now = new Date();
                      const diffMs = now.getTime() - date.getTime();
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      
                      if (diffDays === 0) {
                        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      } else if (diffDays === 1) {
                        return 'Yesterday';
                      } else if (diffDays < 7) {
                        return date.toLocaleDateString([], { weekday: 'short' });
                      } else {
                        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                      }
                    };
                    
                    return (
                      <button
                        key={user.id}
                        onClick={() => setSelectedChatUser(user)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                          selectedChatUser?.id === user.id ? 'border-black bg-gray-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-black ${unreadCount > 0 ? 'font-bold' : ''}`}>
                                {user.firstName} {user.lastName}
                              </span>
                              {unreadCount > 0 && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[11px] font-bold text-white">
                                  {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                              )}
                            </div>
                            {lastMsg ? (
                              <div className={`text-sm truncate mt-0.5 ${unreadCount > 0 ? 'text-black font-medium' : 'text-black/60'}`}>
                                {lastMsg.senderId === sbUser?.id ? 'You: ' : ''}{lastMsg.text}
                              </div>
                            ) : user.linkedinUrl ? (
                              <div className="text-xs text-blue-600 truncate">
                                LinkedIn connected
                              </div>
                            ) : null}
                          </div>
                          {lastMsg && (
                            <div className={`text-xs whitespace-nowrap ${unreadCount > 0 ? 'text-black font-semibold' : 'text-black/50'}`}>
                              {formatDate(lastMsg.createdAt)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            
            {/* Right side - Chat */}
            <div className="relative h-full">
              {!selectedChatUser ? (
                <div className="h-full flex items-center justify-center text-black/50">
                  Select a connection to start messaging
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div className="border-b pb-4 mb-4">
                    <div className="font-bold text-lg text-black">
                      {selectedChatUser.firstName} {selectedChatUser.lastName}
                    </div>
                    {selectedChatUser.linkedinUrl && (
                      <a
                        href={selectedChatUser.linkedinUrl.match(/^https?:\/\/(www\.)?linkedin\.com/) ? selectedChatUser.linkedinUrl : `https://linkedin.com/in/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View LinkedIn Profile
                      </a>
                    )}
                  </div>
                  
                  {/* Messages - scrollable area with padding at bottom for input */}
                  <div data-messages-container className="absolute inset-0 top-16 bottom-16 overflow-y-auto space-y-3 pr-2 flex flex-col">
                    <div className="flex-1" />
                    {messages.length === 0 ? (
                      <div className="text-center text-black/50 py-8">
                        No messages yet. Say hello!
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.senderId === sbUser?.id ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                              msg.senderId === sbUser?.id
                                ? 'bg-black text-white'
                                : 'bg-gray-100 text-black'
                            }`}
                          >
                            <div className="text-sm">{msg.text}</div>
                            <div className={`text-xs mt-1 ${
                              msg.senderId === sbUser?.id ? 'text-white/60' : 'text-black/40'
                            }`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Message input - fixed at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 flex gap-3 bg-white pt-3">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm text-black focus:border-black focus:outline-none"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!messageInput.trim()}
                      className="rounded-xl border border-black bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}