import { FiArrowLeft } from 'react-icons/fi'
import DirIcon from '../../../components/common/DirIcon'
import { IconAction } from '../components/kit'

const BackIcon = ({ className }) => <DirIcon icon={FiArrowLeft} className={className} />

export default function BackLink({ to, label }) {
  return <div><IconAction icon={BackIcon} to={to} label={label} className="-ms-2 border border-gray-200 bg-white" /></div>
}
