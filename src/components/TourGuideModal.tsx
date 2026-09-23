import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, BookOpen, Crown, Scissors, X, Check, MapPin, Sparkles } from 'lucide-react';

interface TourGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TourGuideModal: React.FC<TourGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-[#1a0e08] border border-[#d4af37]/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2b170e] text-[#d4af37] border border-[#d4af37]/30 text-xs font-semibold uppercase tracking-wider mb-2">
                <Compass className="w-3.5 h-3.5" />
                <span>Guía del Turista Digital</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-[#fcf8f2] font-royal">
                Ruta del Chocolate de Sucre
              </h3>
              <p className="text-xs text-[#bda393] mt-1 font-serif-luxury">
                Capital Constitucional de Bolivia y Patrimonio Histórico del Cacao
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#2b170e] hover:bg-[#3d2215] text-[#d4af37] border border-[#d4af37]/25 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Context Note on the Problem in Sucre */}
          <div className="p-3.5 rounded-2xl bg-[#25130b] border-l-4 border-[#d4af37] text-xs text-[#d7c4b7] mb-6 leading-relaxed">
            <strong className="text-[#f1c40f]">Contexto y Misión:</strong> La oferta chocolatera de Sucre es reconocida mundialmente pero su información solía estar dispersa. Esta plataforma interactiva 3D visibiliza y une a las fábricas históricas de la ciudad para turistas e investigadores del cacao boliviano.
          </div>

          {/* Interactive Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
            <div className="p-4 rounded-2xl bg-[#23120a] border border-[#d4af37]/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#d4af37]/15 flex items-center justify-center text-[#f1c40f] flex-shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#fcf8f2]">1. Archipiélago de Islas 3D</h4>
                <p className="text-xs text-[#a89283] mt-1">
                  Navega por las islas flotantes de Chocolates Para Ti, Chocolates Sucre y Chocolates Taboada. Haz clic sobre una para volar hacia ella.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#23120a] border border-[#d4af37]/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#d4af37]/15 flex items-center justify-center text-[#f1c40f] flex-shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#fcf8f2]">2. Pasillo Histórico con Scroll</h4>
                <p className="text-xs text-[#a89283] mt-1">
                  Avanza por el pasillo colonial haciendo scroll con el ratón o deslizando para descubrir archivos, hitos y secretos de maestros chocolateros.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#23120a] border border-[#d4af37]/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#d4af37]/15 flex items-center justify-center text-[#f1c40f] flex-shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#fcf8f2]">3. Sala Real de Productos</h4>
                <p className="text-xs text-[#a89283] mt-1">
                  Las tabletas descansan flotando sobre pedestales de terciopelo real. Selecciona cualquier barra de chocolate para entrar al modo de inspección.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#23120a] border border-[#d4af37]/20 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#d4af37]/15 flex items-center justify-center text-[#f1c40f] flex-shrink-0">
                <Scissors className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#fcf8f2]">4. Desempaquetado 3D y Giro 360°</h4>
                <p className="text-xs text-[#a89283] mt-1">
                  Arrastra el cursor sobre el envoltorio para rasgarlo por pedazos con sonido realista. Una vez libre, gira la tableta 360° y examina sus detalles.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#f1c40f] to-[#b8860b] text-[#1a0f08] font-extrabold text-sm uppercase tracking-wider shadow-xl shadow-[#d4af37]/30 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Comenzar el Recorrido 3D</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
